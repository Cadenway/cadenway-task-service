import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { spaces } from '../space/space.schema.js';
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
 * Table `lists`: the lists of a space, and the sprints, which are lists with a dated period
 * (`sprint_start_date`, `sprint_end_date`, `sprint_goal`; all null for a plain list). The sprint
 * dates are `date` columns read as `YYYY-MM-DD` strings. `id` and `created_at` come from
 * PostgreSQL; `created_at` keeps millisecond precision so that the position of a page round-trips
 * exactly through a JavaScript `Date`. The checks keep a sprint whole: both dates or neither, the
 * end on or after the start, and a goal only on a sprint. `organization_access` is the switch
 * "Accès de l’organisation" of the list (P3b-1). `archived_at` and `archived_by_*` mark an
 * archived list ("Archives", P3b-1), all three set or all three null; `restored_at` is when the
 * list last came back from the archives, which puts it at the end of its space: the order of the
 * sidebar is `(coalesce(restored_at, created_at), id)`. A tenant table: `organization_id`
 * carries the policy of the kit, which the migration forces by hand
 * (`ALTER TABLE "lists" FORCE ROW LEVEL SECURITY;`).
 */
export const taskLists = pgTable(
  'lists',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    spaceId: uuid('space_id').notNull(),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color').notNull(),
    sprintStartDate: date('sprint_start_date', { mode: 'string' }),
    sprintEndDate: date('sprint_end_date', { mode: 'string' }),
    sprintGoal: text('sprint_goal'),
    // The switch "Accès de l’organisation" (P3b-1): on by default, as for every list created
    // before it existed, so the expand-only migration keeps the P3a rule for them.
    organizationAccess: boolean('organization_access').notNull().default(true),
    // The archive of the list (P3b-1): nullable, so the expand-only migration leaves every list of
    // the running version live and in its place.
    archivedAt: timestamp('archived_at', { withTimezone: true, precision: 3 }),
    archivedByType: text('archived_by_type'),
    archivedById: text('archived_by_id'),
    restoredAt: timestamp('restored_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    primaryKey({ name: 'lists_pkey', columns: [table.organizationId, table.id] }),
    foreignKey({
      name: 'lists_space_fkey',
      columns: [table.organizationId, table.spaceId],
      foreignColumns: [spaces.organizationId, spaces.id],
    }),
    index('lists_organization_space_created_index').on(
      table.organizationId,
      table.spaceId,
      table.createdAt,
      table.id,
    ),
    // The archives ("Archives", tab "Listes"): the archived lists of an organization, the most
    // recently archived first; partial, so it holds the archived lists only.
    index('lists_organization_archived_index')
      .on(table.organizationId, table.archivedAt, table.id)
      .where(sql`${table.archivedAt} is not null`),
    check(
      'lists_archived_check',
      sql`(${table.archivedAt} is null) = (${table.archivedByType} is null) and (${table.archivedAt} is null) = (${table.archivedById} is null)`,
    ),
    check(
      'lists_archived_by_type_check',
      sql`${table.archivedByType} is null or ${table.archivedByType} in ('user', 'automation', 'git', 'system')`,
    ),
    check(
      'lists_archived_by_id_check',
      sql`${table.archivedById} is null or ${table.archivedById} <> ''`,
    ),
    check(
      'lists_sprint_dates_check',
      sql`(${table.sprintStartDate} is null) = (${table.sprintEndDate} is null)`,
    ),
    check(
      'lists_sprint_period_check',
      sql`${table.sprintEndDate} is null or ${table.sprintEndDate} >= ${table.sprintStartDate}`,
    ),
    check(
      'lists_sprint_goal_check',
      sql`${table.sprintGoal} is null or ${table.sprintStartDate} is not null`,
    ),
    check('lists_version_check', sql`${table.version} >= 1`),
    check(
      'lists_icon_check',
      sql`${table.icon} is null or ${table.icon} in (${sql.raw(LOOK_ICON_VALUES)})`,
    ),
    check('lists_color_check', sql`${table.color} in (${sql.raw(LOOK_COLOR_VALUES)})`),
    organizationPolicy('lists_organization_isolation'),
  ],
);
