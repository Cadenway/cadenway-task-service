import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, timestamp } from 'drizzle-orm/pg-core';

/** Records when this database began collecting history in the migration that installs it. */
export const sprintHistoryCoverage = pgTable(
  'sprint_history_coverage',
  {
    singleton: boolean('singleton').primaryKey(),
    startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [check('sprint_history_coverage_singleton_check', sql`${table.singleton}`)],
);
