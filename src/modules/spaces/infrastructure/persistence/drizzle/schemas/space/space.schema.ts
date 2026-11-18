import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
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

import type { SpaceStatuses } from '../../../../../domain/value-objects/status/space-statuses.value-object.js';
import { LOOK_COLORS } from '../../../../../domain/value-objects/look/look-color.value-object.js';
import { LOOK_ICONS } from '../../../../../domain/value-objects/look/look-icon.value-object.js';

/**
 * Constant LOOK_ICON_VALUES
 *
 * @description
 * The icons of `LookIcon`, as the SQL list of a CHECK constraint.
 *
 * @type {string}
 */
const LOOK_ICON_VALUES: string = LOOK_ICONS.map((icon: string): string => `'${icon}'`).join(', ');

/**
 * Constant LOOK_COLOR_VALUES
 *
 * @description
 * The colors of `LookColor`, as the SQL list of a CHECK constraint.
 *
 * @type {string}
 */
const LOOK_COLOR_VALUES: string = LOOK_COLORS.map((color: string): string => `'${color}'`).join(
  ', ',
);

/**
 * Table `spaces`: the spaces of an organization ("Espaces"). `id` and `created_at` come from
 * PostgreSQL; `created_at` keeps millisecond precision so that the position of a page, which
 * travels as a JavaScript `Date`, round-trips exactly through the keyset comparison. `statuses`
 * holds the ten statuses by key as `{ name, hidden }`; the category of a status follows from its
 * key and is not stored. `visibility` is `text` with a `CHECK`, never an enumeration type. The
 * primary key and both indexes start with `organization_id`: the listing reads
 * `(organization_id, created_at, id)` and the handover of private spaces reads
 * `(organization_id, owner_user_id)`. A tenant table: `organization_id` carries the policy of the
 * kit, which the migration forces by hand (`ALTER TABLE "spaces" FORCE ROW LEVEL SECURITY;`), as
 * drizzle-kit does not generate it.
 */
export const spaces = pgTable(
  'spaces',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    description: text('description'),
    icon: text('icon'),
    color: text('color').notNull(),
    visibility: text('visibility').notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    statuses: jsonb('statuses').$type<SpaceStatuses>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    primaryKey({ name: 'spaces_pkey', columns: [table.organizationId, table.id] }),
    index('spaces_organization_created_index').on(table.organizationId, table.createdAt, table.id),
    index('spaces_organization_owner_index').on(table.organizationId, table.ownerUserId),
    check('spaces_visibility_check', sql`${table.visibility} in ('organization', 'private')`),
    check('spaces_prefix_check', sql`${table.prefix} ~ '^[A-Z]{2,5}$'`),
    check('spaces_version_check', sql`${table.version} >= 1`),
    check(
      'spaces_icon_check',
      sql`${table.icon} is null or ${table.icon} in (${sql.raw(LOOK_ICON_VALUES)})`,
    ),
    check('spaces_color_check', sql`${table.color} in (${sql.raw(LOOK_COLOR_VALUES)})`),
    organizationPolicy('spaces_organization_isolation'),
  ],
);
