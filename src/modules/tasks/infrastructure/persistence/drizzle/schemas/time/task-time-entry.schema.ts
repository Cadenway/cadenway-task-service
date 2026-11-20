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

import { tasks } from '../task/task.schema.js';

/** Time recorded on a task, retained across moves and removed with the task. */
export const taskTimeEntries = pgTable(
  'task_time_entries',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    taskId: uuid('task_id').notNull(),
    authorUserId: uuid('author_user_id').notNull(),
    minutes: integer('minutes').notNull(),
    workDate: date('work_date', { mode: 'string' }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'task_time_entries_pkey', columns: [table.organizationId, table.id] }),
    foreignKey({
      name: 'task_time_entries_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    index('task_time_entries_task_created_index').on(
      table.organizationId,
      table.taskId,
      table.createdAt,
      table.id,
    ),
    check('task_time_entries_minutes_check', sql`${table.minutes} between 1 and 1440`),
    check(
      'task_time_entries_note_check',
      sql`${table.note} is null or (length(${table.note}) between 1 and 500 and ${table.note} = btrim(${table.note}))`,
    ),
    organizationPolicy('task_time_entries_organization_isolation'),
  ],
);
