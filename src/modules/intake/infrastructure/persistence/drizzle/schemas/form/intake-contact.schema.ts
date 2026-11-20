import { organizationPolicy } from '@cadenway/nest-common/database';
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Applicant contacts are private to the intake module and excluded from task events. */
export const intakeContacts = pgTable(
  'intake_contacts',
  {
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'intake_contacts_pkey', columns: [table.organizationId, table.taskId] }),
    organizationPolicy('intake_contacts_organization_isolation'),
  ],
);
