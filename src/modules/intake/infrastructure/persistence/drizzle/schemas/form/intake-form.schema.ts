import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { IntakeFormFields } from '../../../../../domain/value-objects/form/intake-form-fields.value-object.js';
import type { IntakeStatus } from '../../../../../domain/value-objects/form/intake-status.value-object.js';

/** The current settings for a list. The migration must force its tenant policy. */
export const intakeForms = pgTable(
  'intake_forms',
  {
    organizationId: uuid('organization_id').notNull(),
    listId: uuid('list_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    fields: jsonb('fields').$type<IntakeFormFields>().notNull(),
    defaultStatus: text('default_status').$type<IntakeStatus>().notNull(),
    defaultAssigneeId: uuid('default_assignee_id'),
    publicKey: text('public_key'),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'intake_forms_pkey', columns: [table.organizationId, table.listId] }),
    check('intake_forms_version_check', sql`${table.version} >= 1`),
    check('intake_forms_title_check', sql`length(${table.title}) between 1 and 300`),
    check('intake_forms_fields_check', sql`jsonb_typeof(${table.fields}) = 'object'`),
    organizationPolicy('intake_forms_organization_isolation'),
  ],
);
