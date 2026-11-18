import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { tasks } from './task.schema.js';

/**
 * Table `task_assignees`: the accounts assigned to a task, in the order they were assigned
 * (`position`; a new assignee takes the highest position plus one under the lock of the task, so
 * positions increase and may have gaps after a removal). No foreign key to the memberships: the
 * copy of the memberships belongs to another module, and a removed member is unassigned by the use
 * case that handles the removal. The primary key `(organization_id, task_id, user_id)` also serves
 * the batch load of the assignees of the tasks of a page by its `(organization_id, task_id)` prefix.
 *
 * Index `task_assignees_user_index` on `(organization_id, user_id, task_id)` serves the
 * unassignment of a removed member (every task an account is assigned to, keyset-paged on
 * `task_id` so each batch starts at its range start) and, later, "My tasks". A tenant table: `organization_id` carries the
 * policy of the kit, which the migration forces by hand
 * (`ALTER TABLE "task_assignees" FORCE ROW LEVEL SECURITY;`).
 */
export const taskAssignees = pgTable(
  'task_assignees',
  {
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id').notNull(),
    userId: uuid('user_id').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'task_assignees_pkey',
      columns: [table.organizationId, table.taskId, table.userId],
    }),
    foreignKey({
      name: 'task_assignees_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }),
    index('task_assignees_user_index').on(table.organizationId, table.userId, table.taskId),
    check('task_assignees_position_check', sql`${table.position} >= 0`),
    organizationPolicy('task_assignees_organization_isolation'),
  ],
);
