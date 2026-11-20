import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { GoalResult } from '../../../../../domain/value-objects/goal/goal-result.value-object.js';

/** A tenant's quarter-bound goal and its bounded, versioned key results. */
export const goals = pgTable(
  'goals',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    name: text('name').notNull(),
    quarter: text('quarter').notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    spaceId: uuid('space_id'),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    version: integer('version').notNull().default(1),
    results: jsonb('results')
      .$type<readonly GoalResult[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'goals_pkey', columns: [table.organizationId, table.id] }),
    index('goals_organization_quarter_created_index').on(
      table.organizationId,
      table.quarter,
      table.createdAt,
      table.id,
    ),
    check('goals_version_check', sql`${table.version} > 0`),
    check(
      'goals_quarter_check',
      sql`${table.quarter} ~ '^[0-9]{4}-Q[1-4]$' and left(${table.quarter}, 4) <> '0000'`,
    ),
    check(
      'goals_name_check',
      sql`char_length(${table.name}) between 1 and 300 and ${table.name} ~ '[^[:space:]]'`,
    ),
    check(
      'goals_results_check',
      sql`jsonb_typeof(${table.results}) = 'array' and jsonb_array_length(${table.results}) <= 20`,
    ),
    organizationPolicy('goals_organization_isolation'),
  ],
);
