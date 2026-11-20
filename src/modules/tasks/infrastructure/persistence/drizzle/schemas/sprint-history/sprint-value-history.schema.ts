import { organizationPolicy } from '@cadenway/nest-common/database';
import {
  bigint,
  boolean,
  customType,
  doublePrecision,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { tasks } from '../task/task.schema.js';

const xid8 = customType<{ data: string }>({ dataType: () => 'xid8' });

/** Raw numeric values, including a null entry when the value is removed. */
export const sprintValueHistory = pgTable(
  'sprint_value_history',
  {
    organizationId: uuid('organization_id').notNull(),
    sequence: bigint('sequence', { mode: 'bigint' }).generatedAlwaysAsIdentity(),
    taskId: uuid('task_id').notNull(),
    fieldId: uuid('field_id').notNull(),
    numberValue: doublePrecision('number_value'),
    recordedAt: timestamp('recorded_at', { withTimezone: true, precision: 3 }).notNull(),
    transactionId: xid8('transaction_id').notNull(),
    baseline: boolean('baseline').notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: 'sprint_value_history_pkey',
      columns: [table.organizationId, table.sequence],
    }),
    foreignKey({
      name: 'sprint_value_history_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    index('sprint_value_history_task_field_time_index').on(
      table.organizationId,
      table.taskId,
      table.fieldId,
      table.recordedAt,
      table.sequence,
    ),
    organizationPolicy('sprint_value_history_organization_isolation'),
  ],
);
