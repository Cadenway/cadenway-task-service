import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { tasks } from '../task/task.schema.js';

/**
 * A directed dependency between two tasks of one organization. Retained edges remain in the
 * graph while either task is archived or in the trash; purging either endpoint removes its edges.
 * The migration must force row-level security after creating the table.
 */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    blockerTaskId: uuid('blocker_task_id').notNull(),
    blockedTaskId: uuid('blocked_task_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'task_dependencies_pkey', columns: [table.organizationId, table.id] }),
    unique('task_dependencies_pair_unique').on(
      table.organizationId,
      table.blockerTaskId,
      table.blockedTaskId,
    ),
    foreignKey({
      name: 'task_dependencies_blocker_fkey',
      columns: [table.organizationId, table.blockerTaskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_dependencies_blocked_fkey',
      columns: [table.organizationId, table.blockedTaskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    index('task_dependencies_blocker_created_index').on(
      table.organizationId,
      table.blockerTaskId,
      table.createdAt,
      table.id,
    ),
    index('task_dependencies_blocked_created_index').on(
      table.organizationId,
      table.blockedTaskId,
      table.createdAt,
      table.id,
    ),
    check(
      'task_dependencies_distinct_check',
      sql`${table.blockerTaskId} <> ${table.blockedTaskId}`,
    ),
    organizationPolicy('task_dependencies_organization_isolation'),
  ],
);
