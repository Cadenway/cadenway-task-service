import { organizationPolicy } from '@cadenway/nest-common/database';
import {
  bigint,
  boolean,
  customType,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { taskLists } from '../list/task-list.schema.js';

const xid8 = customType<{ data: string }>({ dataType: () => 'xid8' });

/** Raw list lifecycle and sprint dates, retained until the list is physically purged. */
export const sprintListHistory = pgTable(
  'sprint_list_history',
  {
    organizationId: uuid('organization_id').notNull(),
    sequence: bigint('sequence', { mode: 'bigint' }).generatedAlwaysAsIdentity(),
    listId: uuid('list_id').notNull(),
    spaceId: uuid('space_id').notNull(),
    sprintStartDate: date('sprint_start_date', { mode: 'string' }),
    sprintEndDate: date('sprint_end_date', { mode: 'string' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, precision: 3 }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, precision: 3 }).notNull(),
    transactionId: xid8('transaction_id').notNull(),
    baseline: boolean('baseline').notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: 'sprint_list_history_pkey',
      columns: [table.organizationId, table.sequence],
    }),
    foreignKey({
      name: 'sprint_list_history_list_fkey',
      columns: [table.organizationId, table.listId],
      foreignColumns: [taskLists.organizationId, taskLists.id],
    }).onDelete('cascade'),
    index('sprint_list_history_list_time_index').on(
      table.organizationId,
      table.listId,
      table.recordedAt,
      table.sequence,
    ),
    organizationPolicy('sprint_list_history_organization_isolation'),
  ],
);
