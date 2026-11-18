import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { spaces } from './space.schema.js';

/**
 * Table `space_prefixes`: the prefixes the spaces of an organization use or used, and the counter
 * of task numbers of each. A prefix belongs for good to the first space that claimed it (the
 * primary key is `(organization_id, prefix)`, so a concurrent claim of the same free prefix waits
 * for the other transaction) and `last_number`, the last task number given under it, never goes
 * back. `last_number` is a `bigint` read as a JavaScript number: task numbers stay far below
 * 2^53. A tenant table: `organization_id` carries the policy of the kit, which the migration
 * forces by hand (`ALTER TABLE "space_prefixes" FORCE ROW LEVEL SECURITY;`).
 */
export const spacePrefixes = pgTable(
  'space_prefixes',
  {
    organizationId: uuid('organization_id').notNull(),
    prefix: text('prefix').notNull(),
    spaceId: uuid('space_id').notNull(),
    lastNumber: bigint('last_number', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'space_prefixes_pkey', columns: [table.organizationId, table.prefix] }),
    foreignKey({
      name: 'space_prefixes_space_fkey',
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id],
    }),
    check('space_prefixes_prefix_check', sql`${table.prefix} ~ '^[A-Z]{2,5}$'`),
    check('space_prefixes_last_number_check', sql`${table.lastNumber} >= 0`),
    organizationPolicy('space_prefixes_organization_isolation'),
  ],
);
