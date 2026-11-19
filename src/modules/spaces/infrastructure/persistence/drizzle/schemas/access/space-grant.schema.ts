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

import { spaces } from '../space/space.schema.js';

/**
 * Table `space_grants`: the grants of a space (P3b-1, "Partager"), one per person, each giving
 * its role on the space and on every list of it. `created_at` is when the person was first given
 * access, the order of the listing and of the access events; `granted_at` and `granted_by_*` are
 * when and by whom the current role was given (`grantedAt`, `grantedBy` of `Grant`). The primary
 * key `(organization_id, space_id, user_id)` serves the grants of one space and the lookup of the
 * grant of one person on one space; `space_grants_user_index` serves the grants of one person (the
 * member clean-up). A tenant table: `organization_id` carries the policy of the kit, which the
 * migration forces by hand (`ALTER TABLE "space_grants" FORCE ROW LEVEL SECURITY;`).
 */
export const spaceGrants = pgTable(
  'space_grants',
  {
    organizationId: uuid('organization_id').notNull(),
    spaceId: uuid('space_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    grantedByType: text('granted_by_type').notNull(),
    grantedById: text('granted_by_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    grantedAt: timestamp('granted_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'space_grants_pkey',
      columns: [table.organizationId, table.spaceId, table.userId],
    }),
    foreignKey({
      name: 'space_grants_space_fkey',
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id],
    }),
    index('space_grants_user_index').on(table.organizationId, table.userId, table.spaceId),
    check('space_grants_role_check', sql`${table.role} in ('edit', 'comment', 'view')`),
    check(
      'space_grants_granted_by_type_check',
      sql`${table.grantedByType} in ('user', 'automation', 'git', 'system')`,
    ),
    organizationPolicy('space_grants_organization_isolation'),
  ],
);
