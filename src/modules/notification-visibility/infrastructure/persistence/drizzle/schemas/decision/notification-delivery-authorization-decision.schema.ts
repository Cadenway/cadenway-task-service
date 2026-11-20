import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * An immutable delivery decision and the exact request binding that produced it.
 *
 * The primary key supports tenant-scoped lookup by correlation. The migration forces
 * the organization policy so even the table owner cannot bypass it.
 */
export const notificationDeliveryAuthorizationDecisions = pgTable(
  'notification_delivery_authorization_decisions',
  {
    organizationId: uuid('organization_id').notNull(),
    authorizationRequestId: uuid('authorization_request_id').notNull(),
    recipientId: uuid('recipient_id').notNull(),
    subjectKind: text('subject_kind', { enum: ['task-id', 'task-key'] }).notNull(),
    subjectValue: text('subject_value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }).notNull(),
    decision: text('decision', { enum: ['permit', 'deny'] }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true, precision: 3 }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true, precision: 3 }).notNull(),
    eventId: uuid('event_id').notNull(),
    eventVersion: integer('event_version').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.authorizationRequestId] }),
    check(
      'notification_delivery_decisions_subject_kind_check',
      sql`${table.subjectKind} in ('task-id', 'task-key')`,
    ),
    check(
      'notification_delivery_decisions_subject_value_check',
      sql`length(${table.subjectValue}) > 0`,
    ),
    check(
      'notification_delivery_decisions_decision_check',
      sql`${table.decision} in ('permit', 'deny')`,
    ),
    check('notification_delivery_decisions_event_version_check', sql`${table.eventVersion} = 1`),
    check(
      'notification_delivery_decisions_expiry_check',
      sql`${table.validUntil} <= ${table.expiresAt}`,
    ),
    organizationPolicy('notification_delivery_decisions_organization_isolation'),
  ],
);
