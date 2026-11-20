import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { SavedViewConfiguration } from '../../../../../domain/value-objects/view/saved-view-configuration.value-object.js';

/** Tenant-owned saved views with list-relative order and explicit query and presentation settings. */
export const savedViews = pgTable(
  'saved_views',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    listId: uuid('list_id').notNull(),
    position: bigint('position', { mode: 'number' }).notNull(),
    name: text('name').notNull(),
    icon: text('icon'),
    configuration: jsonb('configuration').$type<SavedViewConfiguration>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    primaryKey({ name: 'saved_views_pkey', columns: [table.organizationId, table.id] }),
    index('saved_views_list_order_index').on(
      table.organizationId,
      table.listId,
      table.position,
      table.id,
    ),
    check('saved_views_position_check', sql`${table.position} > 0`),
    check('saved_views_version_check', sql`${table.version} > 0`),
    check(
      'saved_views_name_check',
      sql`char_length(${table.name}) between 1 and 80 and ${table.name} ~ '[^[:space:]]'`,
    ),
    organizationPolicy('saved_views_organization_isolation'),
  ],
);
