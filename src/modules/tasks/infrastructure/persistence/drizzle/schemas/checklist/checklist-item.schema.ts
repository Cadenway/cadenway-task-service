import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { tasks } from '../task/task.schema.js';

/**
 * Table `checklist_items`: the items of the checklist of a task, in the order of addition
 * (`position`, unique per task). An item is added unticked at the end and is only ticked or
 * unticked afterwards. `id` and `created_at` come from PostgreSQL. The unique constraint
 * `checklist_items_task_position_unique` serves the ordered load of a checklist and its counts,
 * and refuses two items at one position. A tenant table: `organization_id` carries the policy of
 * the kit, which the migration forces by hand
 * (`ALTER TABLE "checklist_items" FORCE ROW LEVEL SECURITY;`).
 */
export const checklistItems = pgTable(
  'checklist_items',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    taskId: uuid('task_id').notNull(),
    text: text('text').notNull(),
    done: boolean('done').notNull().default(false),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'checklist_items_pkey', columns: [table.organizationId, table.id] }),
    foreignKey({
      name: 'checklist_items_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }),
    unique('checklist_items_task_position_unique').on(
      table.organizationId,
      table.taskId,
      table.position,
    ),
    check('checklist_items_position_check', sql`${table.position} >= 0`),
    check('checklist_items_text_check', sql`${table.text} <> ''`),
    organizationPolicy('checklist_items_organization_isolation'),
  ],
);
