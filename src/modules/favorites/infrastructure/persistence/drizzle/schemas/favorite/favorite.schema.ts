import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { FavoriteKind } from '../../../../../domain/value-objects/target/favorite-kind.value-object.js';

/** Private actor preferences with tenant RLS, owner uniqueness and target cleanup indexes. */
export const favorites = pgTable(
  'favorites',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    userId: uuid('user_id').notNull(),
    kind: text('kind').$type<FavoriteKind>().notNull(),
    targetId: uuid('target_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'favorites_pkey', columns: [table.organizationId, table.id] }),
    uniqueIndex('favorites_owner_target_unique').on(
      table.organizationId,
      table.userId,
      table.kind,
      table.targetId,
    ),
    index('favorites_owner_creation_index').on(
      table.organizationId,
      table.userId,
      table.createdAt,
      table.id,
    ),
    index('favorites_target_index').on(table.organizationId, table.kind, table.targetId),
    check('favorites_kind_check', sql`${table.kind} in ('space', 'list', 'saved-view')`),
    check('favorites_version_check', sql`${table.version} >= 1`),
    organizationPolicy('favorites_organization_isolation'),
  ],
);
