import { organizationPolicy } from '@cadenway/nest-common/database';
import { index, boolean, foreignKey, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

import { tasks } from '../task/task.schema.js';

/**
 * Explicit follow or unfollow overrides for task watchers (P3b-2 decisions 7 and 8).
 * The tenant policy is forced by the migration. The task foreign key removes overrides on purge;
 * the user index supports the member-removal job. Defaults are computed, never backfilled.
 */
export const taskWatcherOverrides = pgTable(
  'task_watcher_overrides',
  {
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id').notNull(),
    userId: uuid('user_id').notNull(),
    following: boolean('following').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'task_watcher_overrides_pkey',
      columns: [table.organizationId, table.taskId, table.userId],
    }),
    foreignKey({
      name: 'task_watcher_overrides_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    index('task_watcher_overrides_user_index').on(table.organizationId, table.userId, table.taskId),
    organizationPolicy('task_watcher_overrides_organization_isolation'),
  ],
);
