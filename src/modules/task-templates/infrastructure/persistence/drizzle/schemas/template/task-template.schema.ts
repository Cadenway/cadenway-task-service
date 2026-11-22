import { PRIORITY_KEYS, type PriorityKey } from '@cadenway/contracts';
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

/** The published priority values expressed as a SQL CHECK list. */
const PRIORITY_VALUES: string = PRIORITY_KEYS.map(
  (priority: string): string => `'${priority}'`,
).join(', ');

/**
 * Space-scoped snapshots of task ingredients. Arrays retain their original order and the cursor
 * index supports the contract's `(created_at, id)` order. The migration must force RLS after
 * Drizzle creates the tenant policy.
 */
export const taskTemplates = pgTable(
  'task_templates',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    spaceId: uuid('space_id').notNull(),
    sourceListId: uuid('source_list_id'),
    name: text('name').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    priority: text('priority').$type<PriorityKey>().notNull(),
    labels: jsonb('labels').$type<readonly string[]>().notNull(),
    checklist: jsonb('checklist').$type<readonly string[]>().notNull(),
    subtasks: jsonb('subtasks').$type<readonly string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    primaryKey({ name: 'task_templates_pkey', columns: [table.organizationId, table.id] }),
    index('task_templates_space_created_index').on(
      table.organizationId,
      table.spaceId,
      table.createdAt,
      table.id,
    ),
    check(
      'task_templates_name_check',
      sql`length(${table.name}) between 1 and 80 and ${table.name} ~ '\\S'`,
    ),
    check('task_templates_title_check', sql`${table.title} <> ''`),
    check('task_templates_priority_check', sql`${table.priority} in (${sql.raw(PRIORITY_VALUES)})`),
    check('task_templates_labels_check', sql`jsonb_typeof(${table.labels}) = 'array'`),
    check('task_templates_checklist_check', sql`jsonb_typeof(${table.checklist}) = 'array'`),
    check('task_templates_subtasks_check', sql`jsonb_typeof(${table.subtasks}) = 'array'`),
    check('task_templates_version_check', sql`${table.version} >= 1`),
    organizationPolicy('task_templates_organization_isolation'),
  ],
);
