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

import { taskLists } from '../list/task-list.schema.js';
import { spaces } from '../space/space.schema.js';

/**
 * Table `list_grants`: the grants of a list (P3b-1, "Partager"), one per person, each giving its
 * role on that list only. `space_id` repeats the space of the list, which never changes space in
 * this version (the invariant of `lists`), so that the grants of one person in one space are a
 * range of `list_grants_user_index` (whether a person sees a space through some of its lists).
 * `created_at` is when the person was first given access, the order of the listing and of the
 * access events; `granted_at` and `granted_by_*` are when and by whom the current role was given.
 * The primary key `(organization_id, list_id, user_id)` serves the grants of one list and the
 * lookup of the grant of one person on one list. `list_grants_space_index (organization_id,
 * space_id)` (P3b-1 PR 3) serves the check of `list_grants_space_fkey` when the tombstone of a
 * deleted space is erased, a Seq Scan of the table without it (`tests/trash-queries.int-spec.ts`:
 * 899 buffers against 116 at 40,116 grants). A tenant table: `organization_id` carries the
 * policy of the kit, which the migration forces by hand
 * (`ALTER TABLE "list_grants" FORCE ROW LEVEL SECURITY;`).
 */
export const listGrants = pgTable(
  'list_grants',
  {
    organizationId: uuid('organization_id').notNull(),
    listId: uuid('list_id').notNull(),
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
      name: 'list_grants_pkey',
      columns: [table.organizationId, table.listId, table.userId],
    }),
    foreignKey({
      name: 'list_grants_list_fkey',
      columns: [table.organizationId, table.listId],
      foreignColumns: [taskLists.organizationId, taskLists.id],
    }),
    foreignKey({
      name: 'list_grants_space_fkey',
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id],
    }),
    index('list_grants_user_index').on(
      table.organizationId,
      table.userId,
      table.spaceId,
      table.listId,
    ),
    index('list_grants_space_index').on(table.organizationId, table.spaceId),
    check('list_grants_role_check', sql`${table.role} in ('edit', 'comment', 'view')`),
    check(
      'list_grants_granted_by_type_check',
      sql`${table.grantedByType} in ('user', 'automation', 'git', 'system')`,
    ),
    organizationPolicy('list_grants_organization_isolation'),
  ],
);
