import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { CANCEL_REASONS } from '../../../../../domain/value-objects/task/cancel-reason.value-object.js';
import { PRIORITY_KEYS } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import { STATUS_KEYS } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import { ACTOR_TYPES } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import {
  MAX_ESTIMATE_MINUTES,
  MAX_TASK_NUMBER,
} from '../../../../../domain/value-objects/task/task-limits.value-object.js';

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
 * the use cases keep both ids right (no list or space is deleted in this version). The parent is a
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
 *   lock, the counts of subtasks of a page and the recursive reads of the tree (3 levels at most).
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
    organizationPolicy('tasks_organization_isolation'),
  ],
);
