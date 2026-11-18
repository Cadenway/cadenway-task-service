import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
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
 * end on or after the start, and a goal only on a sprint. A tenant table: `organization_id`
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
