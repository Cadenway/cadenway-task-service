import { organizationPolicy } from '@cadenway/nest-common/database';
import {
  bigint,
  boolean,
  customType,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { spaceCustomFields } from '../custom-field/space-custom-field.schema.js';

const xid8 = customType<{ data: string }>({ dataType: () => 'xid8' });

/** Raw designation and retirement changes for a space's numeric field. */
export const sprintFieldHistory = pgTable(
  'sprint_field_history',
  {
    organizationId: uuid('organization_id').notNull(),
    sequence: bigint('sequence', { mode: 'bigint' }).generatedAlwaysAsIdentity(),
    spaceId: uuid('space_id').notNull(),
    fieldId: uuid('field_id').notNull(),
    designated: boolean('designated').notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true, precision: 3 }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, precision: 3 }).notNull(),
    transactionId: xid8('transaction_id').notNull(),
    baseline: boolean('baseline').notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: 'sprint_field_history_pkey',
      columns: [table.organizationId, table.sequence],
    }),
    foreignKey({
      name: 'sprint_field_history_field_fkey',
      columns: [table.organizationId, table.fieldId],
      foreignColumns: [spaceCustomFields.organizationId, spaceCustomFields.id],
    }).onDelete('cascade'),
    index('sprint_field_history_space_field_time_index').on(
      table.organizationId,
      table.spaceId,
      table.fieldId,
      table.recordedAt,
      table.sequence,
    ),
    organizationPolicy('sprint_field_history_organization_isolation'),
  ],
);
