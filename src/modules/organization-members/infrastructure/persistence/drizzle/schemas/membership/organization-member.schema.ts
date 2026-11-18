import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Table `organization_members`: the copy task-service keeps of the memberships of
 * organization-service, fed by `member.joined.v1`, `member.role-changed.v1` and
 * `member.removed.v1`. `id` is the `memberId` of organization-service, with no default: a
 * projection keeps the id its owner gave. `version` is the highest version of the membership
 * applied; `removed_at` marks a membership that ended, kept so that a late event never brings it
 * back. The primary key starts with `organization_id`, like every index a tenant query uses, so a
 * `memberId` stored under another organization never collides with a row of this one. A tenant
 * table: `organization_id` carries the policy of the kit, which the migration forces by hand
 * (`ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;`), as drizzle-kit does not
 * generate it.
 */
export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    // `bigint`, as `event_versions.version` of the kit: the contract types the version as any
    // integer from 1, which an `integer` column would refuse past 2,147,483,647.
    version: bigint('version', { mode: 'number' }).notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'organization_members_pkey', columns: [table.organizationId, table.id] }),
    index('organization_members_organization_user_index').on(table.organizationId, table.userId),
    check(
      'organization_members_role_check',
      sql`${table.role} in ('owner', 'admin', 'member', 'guest')`,
    ),
    check('organization_members_version_check', sql`${table.version} >= 1`),
    organizationPolicy('organization_members_organization_isolation'),
  ],
);
