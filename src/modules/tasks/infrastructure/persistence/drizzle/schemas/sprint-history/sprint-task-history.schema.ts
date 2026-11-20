import { organizationPolicy } from '@cadenway/nest-common/database';
import {
  bigint,
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { tasks } from '../task/task.schema.js';

const xid8 = customType<{ data: string }>({ dataType: () => 'xid8' });

/** Raw task state after a change, or the original state at coverage start. */
export const sprintTaskHistory = pgTable(
  'sprint_task_history',
  {
    organizationId: uuid('organization_id').notNull(),
    sequence: bigint('sequence', { mode: 'bigint' }).generatedAlwaysAsIdentity(),
    taskId: uuid('task_id').notNull(),
    listId: uuid('list_id').notNull(),
    spaceId: uuid('space_id').notNull(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    status: text('status').notNull(),
    estimateMinutes: integer('estimate_minutes'),
    milestone: boolean('milestone').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, precision: 3 }),
    trashEntryId: uuid('trash_entry_id'),
    recordedAt: timestamp('recorded_at', { withTimezone: true, precision: 3 }).notNull(),
    transactionId: xid8('transaction_id').notNull(),
    baseline: boolean('baseline').notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: 'sprint_task_history_pkey',
      columns: [table.organizationId, table.sequence],
    }),
    foreignKey({
      name: 'sprint_task_history_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    index('sprint_task_history_task_time_index').on(
      table.organizationId,
      table.taskId,
      table.recordedAt,
      table.sequence,
    ),
    index('sprint_task_history_list_task_index').on(
      table.organizationId,
      table.listId,
      table.taskId,
    ),
    organizationPolicy('sprint_task_history_organization_isolation'),
  ],
);
