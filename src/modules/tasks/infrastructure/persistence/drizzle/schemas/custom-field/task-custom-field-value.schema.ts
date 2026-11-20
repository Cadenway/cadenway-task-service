import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { tasks } from '../task/task.schema.js';
import { spaceCustomFields } from './space-custom-field.schema.js';

/** Sparse current values. Task purge removes them with the task, including for retired fields. */
export const taskCustomFieldValues = pgTable(
  'task_custom_field_values',
  {
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id').notNull(),
    fieldId: uuid('field_id').notNull(),
    numberValue: doublePrecision('number_value'),
    textValue: text('text_value'),
  },
  (table) => [
    primaryKey({
      name: 'task_custom_field_values_pkey',
      columns: [table.organizationId, table.taskId, table.fieldId],
    }),
    foreignKey({
      name: 'task_custom_field_values_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'task_custom_field_values_field_fkey',
      columns: [table.organizationId, table.fieldId],
      foreignColumns: [spaceCustomFields.organizationId, spaceCustomFields.id],
    }).onDelete('cascade'),
    index('task_custom_field_values_field_index').on(
      table.organizationId,
      table.fieldId,
      table.taskId,
    ),
    index('task_custom_field_values_negative_index')
      .on(table.organizationId, table.fieldId)
      .where(sql`${table.numberValue} < 0`),
    check(
      'task_custom_field_values_one_value_check',
      sql`(${table.numberValue} is null) <> (${table.textValue} is null)`,
    ),
    check(
      'task_custom_field_values_number_check',
      sql`${table.numberValue} is null or (${table.numberValue} > '-Infinity'::float8 and ${table.numberValue} < 'Infinity'::float8)`,
    ),
    check(
      'task_custom_field_values_text_check',
      sql`${table.textValue} is null or char_length(${table.textValue}) <= 500`,
    ),
    organizationPolicy('task_custom_field_values_organization_isolation'),
  ],
);
