import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import type { DescriptionMention } from '../../../../../domain/value-objects/mention/description-mention.value-object.js';
import { CANCEL_REASONS } from '../../../../../domain/value-objects/task/cancel-reason.value-object.js';
import { PRIORITY_KEYS } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import { STATUS_KEYS } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import { ACTOR_TYPES } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import {
  MAX_ESTIMATE_MINUTES,
  MAX_TASK_NUMBER,
} from '../../../../../domain/value-objects/task/task-limits.value-object.js';
import { trashEntries } from '../trash/trash-entry.schema.js';

/**
 * Function toSqlList
 *
 * @description
 * A closed set of keys as the SQL list of a CHECK constraint.
 *
 * @param {readonly string[]} values - The keys of the set.
 * @returns {string} The quoted, comma-separated list.
 */
function toSqlList(values: readonly string[]): string {
  return values.map((value: string): string => `'${value}'`).join(', ');
}

/**
 * Table `tasks`: the tasks and subtasks of an organization. The key of a task is stored on it
 * (`key_prefix`, `key_number`, unique per organization), so a task keeps its key when it moves to
 * another space or when its space changes prefix. `space_id` and `list_id` carry no foreign key:
 * the lists and spaces tables belong to the spaces module, whose schema this module cannot import;
 * the use cases keep both ids right (a deleted list or space stays as a tombstone until the last
 * trash entry of its tasks is erased). The parent is a
 * foreign key to the same table. `id` and `created_at` come from PostgreSQL; the columns a page or
 * a comparison reads (`created_at`, `completed_at`) keep millisecond precision so that they
 * round-trip exactly through a JavaScript `Date`. `due_date` and `start_date` are `date` columns
 * read as `YYYY-MM-DD` strings. `status`, `priority` and the actor type are `text` with a `CHECK`,
 * never an enumeration type. The primary key and every index start with `organization_id`. A
 * tenant table: `organization_id` carries the policy of the kit, which the migration forces by hand
 * (`ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;`).
 *
 * Indexes:
 * - `tasks_key_unique` resolves every route by key;
 * - `tasks_parent_created_index` serves the pages and counts of subtasks, the child count under
 *   lock, the counts of subtasks of a page and the recursive reads of the tree (3 levels at most);
 * - `tasks_list_created_index` on `(organization_id, list_id, created_at, id)` serves every
 *   statement on the tasks of one list (the page, the total, the groups and the counts) as one
 *   range of the list, and the pages in the order of creation (`manual`, `createdAt`), in both
 *   directions, as an ordered scan that stops at the limit;
 * - `tasks_archive_root_index` (partial on `archive_root`) and `tasks_archive_member_index`
 *   (partial on `archive_root_id is not null`), on the archived tasks only: the roots of the
 *   archives the most recently archived first ("Archives", tab "Tâches"), and the members of one
 *   archive (its restoration, the count of its subtasks);
 * - `tasks_trash_entry_index` (partial on `trash_entry_id is not null`), on the trashed tasks only:
 *   the members of one trash entry (its restoration lock, its erasure, its counts).
 *
 * Archives (P3b-1): `archived_at`, `archived_by_*` and `archive_root_id` are all set or all null.
 * `archive_root_id` names the task an archive was made from (the root itself for the root), a
 * foreign key to the same table; a task whose `archived_at` is null is live. `archive_root` is true
 * exactly for the root of an archive (`archive_root_id = id`, which the check keeps): a column of
 * its own, because PostgreSQL has no statistics for a comparison of two columns, and with
 * `archive_root_id = id` as the predicate of the partial index it misjudged the keyset of the
 * second page of the archives and read every root (`tests/archive-queries.int-spec.ts`).
 *
 * Trash (P3b-1 PR 3): `trash_entry_id` names the trash entry the task belongs to, a foreign key
 * `(organization_id, trash_entry_id)` to `trash_entries`, and is null for a task that is not in
 * the trash. An archived task in the trash keeps its archive columns (it went with its subtree or
 * its list, and comes back in its archive): the statements of the archives leave the tasks in the
 * trash out.
 */
export const tasks = pgTable(
  'tasks',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    keyPrefix: text('key_prefix').notNull(),
    keyNumber: integer('key_number').notNull(),
    spaceId: uuid('space_id').notNull(),
    listId: uuid('list_id').notNull(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    description: text('description'),
    descriptionMentions: jsonb('description_mentions').$type<{
      readonly descriptionDigest: string;
      readonly spans: readonly DescriptionMention[];
    }>(),
    status: text('status').notNull(),
    cancelReason: text('cancel_reason'),
    cancelNote: text('cancel_note'),
    priority: text('priority').notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    startDate: date('start_date', { mode: 'string' }),
    estimateMinutes: integer('estimate_minutes'),
    completedAt: timestamp('completed_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    createdByType: text('created_by_type').notNull(),
    createdById: text('created_by_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
    // The archive the task belongs to (P3b-1): nullable, so the expand-only migration leaves every
    // task of the running version live.
    archivedAt: timestamp('archived_at', { withTimezone: true, precision: 3 }),
    archivedByType: text('archived_by_type'),
    archivedById: text('archived_by_id'),
    archiveRootId: uuid('archive_root_id'),
    // A constant default: the expand-only migration adds it without rewriting the table, and the
    // running version, which never writes it, keeps every task live and not a root.
    archiveRoot: boolean('archive_root').notNull().default(false),
    // The trash entry the task belongs to (P3b-1 PR 3): nullable, so the expand-only migration
    // leaves every task of the running version out of the trash.
    trashEntryId: uuid('trash_entry_id'),
  },
  (table) => [
    primaryKey({ name: 'tasks_pkey', columns: [table.organizationId, table.id] }),
    unique('tasks_key_unique').on(table.organizationId, table.keyPrefix, table.keyNumber),
    foreignKey({
      name: 'tasks_parent_fkey',
      columns: [table.organizationId, table.parentId],
      foreignColumns: [table.organizationId, table.id],
    }),
    index('tasks_parent_created_index').on(
      table.organizationId,
      table.parentId,
      table.createdAt,
      table.id,
    ),
    index('tasks_list_created_index').on(
      table.organizationId,
      table.listId,
      table.createdAt,
      table.id,
    ),
    check('tasks_key_prefix_check', sql`${table.keyPrefix} ~ '^[A-Z]{2,5}$'`),
    check(
      'tasks_key_number_check',
      sql`${table.keyNumber} between 1 and ${sql.raw(String(MAX_TASK_NUMBER))}`,
    ),
    check('tasks_status_check', sql`${table.status} in (${sql.raw(toSqlList(STATUS_KEYS))})`),
    check('tasks_priority_check', sql`${table.priority} in (${sql.raw(toSqlList(PRIORITY_KEYS))})`),
    check(
      'tasks_cancel_reason_check',
      sql`${table.cancelReason} is null or ${table.cancelReason} in (${sql.raw(toSqlList(CANCEL_REASONS))})`,
    ),
    check(
      'tasks_cancelled_check',
      sql`(${table.status} = 'cancelled') = (${table.cancelReason} is not null)`,
    ),
    check(
      'tasks_cancel_note_check',
      sql`${table.cancelNote} is null or ${table.status} = 'cancelled'`,
    ),
    check(
      'tasks_completed_check',
      sql`(${table.status} = 'done') = (${table.completedAt} is not null)`,
    ),
    check(
      'tasks_schedule_check',
      sql`${table.startDate} is null or (${table.dueDate} is not null and ${table.startDate} <= ${table.dueDate})`,
    ),
    check(
      'tasks_estimate_check',
      sql`${table.estimateMinutes} is null or ${table.estimateMinutes} between 1 and ${sql.raw(String(MAX_ESTIMATE_MINUTES))}`,
    ),
    check(
      'tasks_created_by_type_check',
      sql`${table.createdByType} in (${sql.raw(toSqlList(ACTOR_TYPES))})`,
    ),
    check('tasks_created_by_id_check', sql`${table.createdById} <> ''`),
    check('tasks_parent_check', sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`),
    check('tasks_version_check', sql`${table.version} >= 1`),
    foreignKey({
      name: 'tasks_archive_root_fkey',
      columns: [table.organizationId, table.archiveRootId],
      foreignColumns: [table.organizationId, table.id],
    }),
    index('tasks_archive_root_index')
      .on(table.organizationId, table.archivedAt, table.id)
      .where(sql`${table.archiveRoot}`),
    index('tasks_archive_member_index')
      .on(table.organizationId, table.archiveRootId)
      .where(sql`${table.archiveRootId} is not null`),
    check(
      'tasks_archived_check',
      sql`(${table.archivedAt} is null) = (${table.archivedByType} is null) and (${table.archivedAt} is null) = (${table.archivedById} is null) and (${table.archivedAt} is null) = (${table.archiveRootId} is null)`,
    ),
    check(
      'tasks_archive_root_check',
      sql`${table.archiveRoot} = coalesce(${table.archiveRootId} = ${table.id}, false)`,
    ),
    check(
      'tasks_archived_by_type_check',
      sql`${table.archivedByType} is null or ${table.archivedByType} in (${sql.raw(toSqlList(ACTOR_TYPES))})`,
    ),
    check(
      'tasks_archived_by_id_check',
      sql`${table.archivedById} is null or ${table.archivedById} <> ''`,
    ),
    foreignKey({
      name: 'tasks_trash_entry_fkey',
      columns: [table.organizationId, table.trashEntryId],
      foreignColumns: [trashEntries.organizationId, trashEntries.id],
    }),
    index('tasks_trash_entry_index')
      .on(table.organizationId, table.trashEntryId)
      .where(sql`${table.trashEntryId} is not null`),
    organizationPolicy('tasks_organization_isolation'),
  ],
);
