import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { ACTIVITY_KINDS } from '../../../../../domain/value-objects/activity/activity-kind.value-object.js';
import { PRIORITY_KEYS } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import { STATUS_KEYS } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import { ACTOR_TYPES } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import { tasks } from '../task/task.schema.js';

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
 * Table `activity_entries`: the activity log of the tasks ("Activité"). One row per entry, with the
 * detail of its kind in typed columns: `status_from`/`status_to` for `status`,
 * `priority_from`/`priority_to` for `priority`, `due_from`/`due_to` for `due` (one of them may be
 * null: a due date set or removed), `assignee_user_id`/`assignee_added` for `assign`, and none for
 * `create`; the checks tie every column to its kind. `list_id` is the list the task was in at the
 * change, with no foreign key (the lists table belongs to the spaces module). `occurred_at` keeps
 * millisecond precision so that the position of a page round-trips exactly through a JavaScript
 * `Date`. `id` comes from PostgreSQL. A tenant table: `organization_id` carries the policy of the
 * kit, which the migration forces by hand
 * (`ALTER TABLE "activity_entries" FORCE ROW LEVEL SECURITY;`).
 *
 * Indexes (a B-tree serves the descending order of the pages):
 * - `activity_entries_task_index`: the activity of a task, its count and the candidate of a merge;
 * - `activity_entries_list_index`: the activity of a list and its count.
 */
export const activityEntries = pgTable(
  'activity_entries',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    taskId: uuid('task_id').notNull(),
    listId: uuid('list_id').notNull(),
    kind: text('kind').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    actorProvider: text('actor_provider'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, precision: 3 }).notNull(),
    statusFrom: text('status_from'),
    statusTo: text('status_to'),
    initialStatus: text('initial_status'),
    priorityFrom: text('priority_from'),
    priorityTo: text('priority_to'),
    dueFrom: date('due_from', { mode: 'string' }),
    dueTo: date('due_to', { mode: 'string' }),
    assigneeUserId: uuid('assignee_user_id'),
    assigneeAdded: boolean('assignee_added'),
    commentId: uuid('comment_id'),
    commentExcerpt: text('comment_excerpt'),
  },
  (table) => [
    primaryKey({ name: 'activity_entries_pkey', columns: [table.organizationId, table.id] }),
    foreignKey({
      name: 'activity_entries_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }),
    index('activity_entries_task_index').on(
      table.organizationId,
      table.taskId,
      table.occurredAt,
      table.id,
    ),
    index('activity_entries_list_index').on(
      table.organizationId,
      table.listId,
      table.occurredAt,
      table.id,
    ),
    check(
      'activity_entries_kind_check',
      sql`${table.kind} in (${sql.raw(toSqlList(ACTIVITY_KINDS))})`,
    ),
    check(
      'activity_entries_actor_type_check',
      sql`${table.actorType} in (${sql.raw(toSqlList(ACTOR_TYPES))})`,
    ),
    check('activity_entries_actor_id_check', sql`${table.actorId} <> ''`),
    check(
      'activity_entries_actor_provider_check',
      sql`${table.actorProvider} is null or (${table.actorType} = 'git' and ${table.actorProvider} in ('github', 'gitlab'))`,
    ),
    check(
      'activity_entries_status_check',
      sql`(${table.kind} = 'status') = (${table.statusFrom} is not null) and (${table.kind} = 'status') = (${table.statusTo} is not null) and (${table.statusFrom} is null or ${table.statusFrom} in (${sql.raw(toSqlList(STATUS_KEYS))})) and (${table.statusTo} is null or ${table.statusTo} in (${sql.raw(toSqlList(STATUS_KEYS))}))`,
    ),
    check(
      'activity_entries_initial_status_check',
      sql`${table.initialStatus} is null or (${table.kind} = 'create' and ${table.initialStatus} in (${sql.raw(toSqlList(STATUS_KEYS))}))`,
    ),
    check(
      'activity_entries_priority_check',
      sql`(${table.kind} = 'priority') = (${table.priorityFrom} is not null) and (${table.kind} = 'priority') = (${table.priorityTo} is not null) and (${table.priorityFrom} is null or ${table.priorityFrom} in (${sql.raw(toSqlList(PRIORITY_KEYS))})) and (${table.priorityTo} is null or ${table.priorityTo} in (${sql.raw(toSqlList(PRIORITY_KEYS))}))`,
    ),
    check(
      'activity_entries_due_check',
      sql`case when ${table.kind} = 'due' then ${table.dueFrom} is not null or ${table.dueTo} is not null else ${table.dueFrom} is null and ${table.dueTo} is null end`,
    ),
    check(
      'activity_entries_assignee_check',
      sql`(${table.kind} = 'assign') = (${table.assigneeUserId} is not null) and (${table.kind} = 'assign') = (${table.assigneeAdded} is not null)`,
    ),
    organizationPolicy('activity_entries_organization_isolation'),
  ],
);
