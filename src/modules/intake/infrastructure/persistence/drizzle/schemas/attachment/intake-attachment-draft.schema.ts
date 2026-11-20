import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { intakePublications } from '../form/intake-publication.schema.js';

/** One applicant's opaque, publication-bound draft. The migration forces its tenant policy. */
export const intakeAttachmentDrafts = pgTable(
  'intake_attachment_drafts',
  {
    organizationId: uuid('organization_id').notNull(),
    publicationId: uuid('publication_id').notNull(),
    draftDigest: text('draft_digest').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'intake_attachment_drafts_pkey',
      columns: [table.organizationId, table.publicationId, table.draftDigest],
    }),
    foreignKey({
      name: 'intake_attachment_drafts_publication_fkey',
      columns: [table.organizationId, table.publicationId],
      foreignColumns: [intakePublications.organizationId, intakePublications.id],
    }),
    check('intake_attachment_drafts_digest_check', sql`${table.draftDigest} ~ '^[0-9a-f]{64}$'`),
    index('intake_attachment_drafts_expiry_index')
      .on(table.expiresAt, table.organizationId, table.publicationId, table.draftDigest)
      .where(sql`${table.closedAt} is null`),
    organizationPolicy('intake_attachment_drafts_organization_isolation'),
  ],
);
