import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Reference only: the spaces module owns this table and its lifecycle.
const spaces = pgTable('spaces', {
  organizationId: uuid('organization_id').notNull(),
  id: uuid('id').notNull(),
});

/** Ordered definitions of space columns. A retired definition remains available to historical data. */
export const spaceCustomFields = pgTable(
  'space_custom_fields',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    spaceId: uuid('space_id').notNull(),
    name: text('name').notNull(),
    type: text('type').$type<'number' | 'text'>().notNull(),
    position: integer('position').notNull(),
    sprintPoints: boolean('sprint_points').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    primaryKey({ name: 'space_custom_fields_pkey', columns: [table.organizationId, table.id] }),
    foreignKey({
      name: 'space_custom_fields_space_fkey',
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id],
    }).onDelete('cascade'),
    index('space_custom_fields_space_index').on(table.organizationId, table.spaceId),
    index('space_custom_fields_active_order_index')
      .on(table.organizationId, table.spaceId, table.position, table.id)
      .where(sql`${table.retiredAt} is null`),
    uniqueIndex('space_custom_fields_sprint_points_unique')
      .on(table.organizationId, table.spaceId)
      .where(sql`${table.retiredAt} is null and ${table.sprintPoints}`),
    check('space_custom_fields_type_check', sql`${table.type} in ('number', 'text')`),
    check('space_custom_fields_position_check', sql`${table.position} between 0 and 29`),
    check('space_custom_fields_version_check', sql`${table.version} >= 1`),
    check(
      'space_custom_fields_name_check',
      sql`char_length(${table.name}) between 1 and 80 and ${table.name} ~ '[^[:space:]]'`,
    ),
    check(
      'space_custom_fields_sprint_points_check',
      sql`not ${table.sprintPoints} or (${table.type} = 'number' and ${table.retiredAt} is null)`,
    ),
    organizationPolicy('space_custom_fields_organization_isolation'),
  ],
);
