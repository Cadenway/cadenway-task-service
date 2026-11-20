import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { intakePublications } from './intake-publication.schema.js';

/** Successful submission receipts are retained for the idempotency window. */
export const intakeSubmissions = pgTable(
  'intake_submissions',
  {
    organizationId: uuid('organization_id').notNull(),
    publicationId: uuid('publication_id').notNull(),
    keyDigest: text('key_digest').notNull(),
    fingerprint: text('fingerprint').notNull(),
    receipt: text('receipt').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'intake_submissions_pkey',
      columns: [table.organizationId, table.publicationId, table.keyDigest],
    }),
    foreignKey({
      name: 'intake_submissions_publication_fkey',
      columns: [table.organizationId, table.publicationId],
      foreignColumns: [intakePublications.organizationId, intakePublications.id],
    }),
    check('intake_submissions_key_digest_check', sql`${table.keyDigest} ~ '^[0-9a-f]{64}$'`),
    organizationPolicy('intake_submissions_organization_isolation'),
  ],
);
