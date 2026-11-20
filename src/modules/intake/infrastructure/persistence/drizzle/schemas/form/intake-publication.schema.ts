import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Permanent digest reservations prevent a revoked public link from being reissued. */
export const intakePublications = pgTable(
  'intake_publications',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    listId: uuid('list_id'),
    keyDigest: text('key_digest').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'intake_publications_pkey', columns: [table.organizationId, table.id] }),
    uniqueIndex('intake_publications_key_digest_unique').on(table.keyDigest),
    check('intake_publications_key_digest_check', sql`${table.keyDigest} ~ '^[0-9a-f]{64}$'`),
    organizationPolicy('intake_publications_organization_isolation'),
  ],
);
