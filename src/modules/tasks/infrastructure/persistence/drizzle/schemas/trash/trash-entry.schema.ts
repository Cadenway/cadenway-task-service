import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { ACTOR_TYPES } from '../../../../../domain/value-objects/task/task-actor.value-object.js';

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
 * Table `trash_entries`: the entries of the trash ("Corbeille", P3b-1 PR 3), one row per
 * `TrashEntry` of `openapi/public/trash.yaml`: a task and its subtasks at every level, deleted
 * together, which come back or are erased together. The tasks of an entry point to it through
 * `tasks.trash_entry_id`. `root_task_id` is the task at the root of the entry and `list_id` the list
 * of that root, which every task of the entry keeps: the list the entry comes back to. `parent_key`
 * is the key the parent of the root had when it was deleted, as it read then ("Sous-tâche de
 * CAD-482"), and null for a top-level task. `task_count` is the root and its subtasks in the entry.
 * `trashed_at` keeps millisecond precision so that the position of a page round-trips exactly
 * through a JavaScript `Date`; `trashed_by_*` is who deleted the task. `purge_requested_at` and
 * `purge_requested_by_*` are set by "Vider la corbeille": the entry then left the trash and waits
 * for the purge job, which erases it with that actor; all three set or all three null. For a
 * partial purge, `purge_root_key`, `purge_root_name` and `purge_root_status` retain the original
 * root once its task row is erased; they stay null for entries not yet purged. `id` comes from
 * PostgreSQL. A tenant table: `organization_id` carries the policy of the kit, which the
 * migration forces by hand (`ALTER TABLE "trash_entries" FORCE ROW LEVEL SECURITY;`).
 *
 * No foreign key leaves this table, on purpose. `root_task_id` has none: an entry and its tasks are
 * erased in the same transaction for whole entries, and `tasks.trash_entry_id` already references the entry, so a foreign key in both
 * directions would make every erasure order fail. `list_id` has none, like `tasks.list_id`: the
 * lists table belongs to the spaces module, whose schema this module cannot import.
 *
 * Indexes, both partial and starting with `organization_id`:
 * - `trash_entries_trashed_index` on `(organization_id, trashed_at, id)` for the entries still in
 *   the trash: the page of the trash (walked backwards, the most recently deleted first, with the
 *   lists of the caller as a filter), its total, and the daily purge scan (the entries 30 days old,
 *   from the start);
 * - `trash_entries_purge_requested_index` on `(organization_id, purge_requested_at, id)` for the
 *   entries "Vider la corbeille" handed to the purge job.
 */
export const trashEntries = pgTable(
  'trash_entries',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    rootTaskId: uuid('root_task_id').notNull(),
    listId: uuid('list_id').notNull(),
    parentKey: text('parent_key'),
    taskCount: integer('task_count').notNull(),
    trashedAt: timestamp('trashed_at', { withTimezone: true, precision: 3 }).notNull(),
    trashedByType: text('trashed_by_type').notNull(),
    trashedById: text('trashed_by_id').notNull(),
    // The hand-over to the purge job by "Vider la corbeille": null while the entry is in the trash.
    purgeRequestedAt: timestamp('purge_requested_at', { withTimezone: true, precision: 3 }),
    purgeRequestedByType: text('purge_requested_by_type'),
    purgeRequestedById: text('purge_requested_by_id'),
    purgeRootKey: text('purge_root_key'),
    purgeRootName: text('purge_root_name'),
    purgeRootStatus: text('purge_root_status'),
  },
  (table) => [
    primaryKey({ name: 'trash_entries_pkey', columns: [table.organizationId, table.id] }),
    index('trash_entries_trashed_index')
      .on(table.organizationId, table.trashedAt, table.id)
      .where(sql`${table.purgeRequestedAt} is null`),
    index('trash_entries_purge_requested_index')
      .on(table.organizationId, table.purgeRequestedAt, table.id)
      .where(sql`${table.purgeRequestedAt} is not null`),
    check(
      'trash_entries_parent_key_check',
      sql`${table.parentKey} is null or ${table.parentKey} ~ '^[A-Z]{2,5}-[1-9][0-9]{0,8}$'`,
    ),
    check('trash_entries_task_count_check', sql`${table.taskCount} >= 1`),
    check(
      'trash_entries_trashed_by_type_check',
      sql`${table.trashedByType} in (${sql.raw(toSqlList(ACTOR_TYPES))})`,
    ),
    check('trash_entries_trashed_by_id_check', sql`${table.trashedById} <> ''`),
    check(
      'trash_entries_purge_requested_check',
      sql`(${table.purgeRequestedAt} is null) = (${table.purgeRequestedByType} is null) and (${table.purgeRequestedAt} is null) = (${table.purgeRequestedById} is null)`,
    ),
    check(
      'trash_entries_purge_requested_by_type_check',
      sql`${table.purgeRequestedByType} is null or ${table.purgeRequestedByType} in (${sql.raw(toSqlList(ACTOR_TYPES))})`,
    ),
    check(
      'trash_entries_purge_requested_by_id_check',
      sql`${table.purgeRequestedById} is null or ${table.purgeRequestedById} <> ''`,
    ),
    organizationPolicy('trash_entries_organization_isolation'),
  ],
);
