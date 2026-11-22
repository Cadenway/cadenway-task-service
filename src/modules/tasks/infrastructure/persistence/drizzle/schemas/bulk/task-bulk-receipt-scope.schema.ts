import { idempotencyKeys, organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Original list scope of an idempotent bulk task receipt. */
export const taskBulkReceiptScopes = pgTable(
  'task_bulk_receipt_scopes',
  {
    organizationId: uuid('organization_id').notNull(),
    key: text('key').notNull(),
    receiptAt: timestamp('receipt_at', { withTimezone: true }).notNull().defaultNow(),
    listIds: uuid('list_ids').array().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'task_bulk_receipt_scopes_pkey',
      columns: [table.organizationId, table.key],
    }),
    foreignKey({
      name: 'task_bulk_receipt_scopes_receipt_fkey',
      columns: [table.organizationId, table.key],
      foreignColumns: [idempotencyKeys.organizationId, idempotencyKeys.key],
    }).onDelete('cascade'),
    check(
      'task_bulk_receipt_scopes_list_ids_check',
      sql`cardinality(${table.listIds}) between 1 and 51`,
    ),
    organizationPolicy('task_bulk_receipt_scopes_organization_isolation'),
  ],
);
