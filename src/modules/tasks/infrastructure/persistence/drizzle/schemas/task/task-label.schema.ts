import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { tasks } from './task.schema.js';

/**
 * Table `task_labels`: the labels of a task, in the order they were added (`position`). `label_key`
 * is the key two labels are compared by (the domain fold: Unicode form C, lower case), `name` the
 * first spelling, trimmed. The primary key `(organization_id, task_id, label_key)` keeps a label
 * once per task and serves the batch load of the labels of the tasks of a page by its
 * `(organization_id, task_id)` prefix. A tenant table: `organization_id` carries the policy of the
 * kit, which the migration forces by hand
 * (`ALTER TABLE "task_labels" FORCE ROW LEVEL SECURITY;`).
 */
export const taskLabels = pgTable(
  'task_labels',
  {
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id').notNull(),
    labelKey: text('label_key').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'task_labels_pkey',
      columns: [table.organizationId, table.taskId, table.labelKey],
    }),
    foreignKey({
      name: 'task_labels_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }),
    check('task_labels_position_check', sql`${table.position} >= 0`),
    check('task_labels_name_check', sql`${table.name} <> ''`),
    organizationPolicy('task_labels_organization_isolation'),
  ],
);
