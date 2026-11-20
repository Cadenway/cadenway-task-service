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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { intakeAttachmentDrafts } from './intake-attachment-draft.schema.js';

/** A reservation retains its request fingerprint and terminal state for cleanup and replay. */
export const intakeAttachmentReservations = pgTable(
  'intake_attachment_reservations',
  {
    organizationId: uuid('organization_id').notNull(),
    publicationId: uuid('publication_id').notNull(),
    draftDigest: text('draft_digest').notNull(),
    attachmentId: uuid('attachment_id')
      .notNull()
      .default(sql`uuidv7()`),
    requestKeyDigest: text('request_key_digest').notNull(),
    declarationDigest: text('declaration_digest').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }).notNull(),
    status: text('status').$type<'reserved' | 'verified' | 'claimed' | 'released'>().notNull(),
    taskKey: text('task_key'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'intake_attachment_reservations_pkey',
      columns: [table.organizationId, table.attachmentId],
    }),
    foreignKey({
      name: 'intake_attachment_reservations_draft_fkey',
      columns: [table.organizationId, table.publicationId, table.draftDigest],
      foreignColumns: [
        intakeAttachmentDrafts.organizationId,
        intakeAttachmentDrafts.publicationId,
        intakeAttachmentDrafts.draftDigest,
      ],
    }),
    uniqueIndex('intake_attachment_reservations_request_unique').on(
      table.organizationId,
      table.publicationId,
      table.draftDigest,
      table.requestKeyDigest,
    ),
    index('intake_attachment_reservations_active_draft_index')
      .on(table.organizationId, table.publicationId, table.draftDigest, table.attachmentId)
      .where(sql`${table.status} in ('reserved', 'verified')`),
    index('intake_attachment_reservations_terminal_expiry_index')
      .on(table.updatedAt, table.organizationId, table.attachmentId)
      .where(sql`${table.status} in ('claimed', 'released')`),
    check(
      'intake_attachment_reservations_key_check',
      sql`${table.requestKeyDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'intake_attachment_reservations_declaration_digest_check',
      sql`${table.declarationDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'intake_attachment_reservations_status_check',
      sql`${table.status} in ('reserved', 'verified', 'claimed', 'released')`,
    ),
    check(
      'intake_attachment_reservations_task_check',
      sql`(${table.status} = 'claimed') = (${table.taskKey} is not null)`,
    ),
    organizationPolicy('intake_attachment_reservations_organization_isolation'),
  ],
);
