import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Reference only. The task module owns and manages the referenced rows.
const tasks = pgTable('tasks', {
  organizationId: uuid('organization_id').notNull(),
  id: uuid('id').notNull(),
});

/** Approval rounds remain with their task until its permanent erasure. */
export const taskApprovalRounds = pgTable(
  'task_approval_rounds',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    taskId: uuid('task_id').notNull(),
    requesterUserId: uuid('requester_user_id').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true, precision: 3 }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    primaryKey({ name: 'task_approval_rounds_pkey', columns: [table.organizationId, table.id] }),
    foreignKey({
      name: 'task_approval_rounds_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    uniqueIndex('task_approval_rounds_current_unique')
      .on(table.organizationId, table.taskId)
      .where(sql`${table.closedAt} is null`),
    index('task_approval_rounds_task_index').on(table.organizationId, table.taskId),
    organizationPolicy('task_approval_rounds_organization_isolation'),
  ],
);
