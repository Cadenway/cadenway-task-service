import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { CommentMention } from '../../../../../domain/policies/comment/comment-text.policy.js';

// Reference only: tasks owns this table; no task data is read by this module's schema.
const tasks = pgTable('tasks', {
  organizationId: uuid('organization_id').notNull(),
  id: uuid('id').notNull(),
});

/** Comments and content-free tombstones, scoped by organization (P3b-2 decisions 1, 5 and 6). */
export const taskComments = pgTable(
  'task_comments',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    taskId: uuid('task_id').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    body: text('body'),
    mentions: jsonb('mentions')
      .$type<readonly CommentMention[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    replyToCommentId: uuid('reply_to_comment_id'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true, precision: 3 }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, precision: 3 }),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    primaryKey({ name: 'task_comments_pkey', columns: [table.organizationId, table.id] }),
    foreignKey({
      name: 'task_comments_task_fkey',
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }).onDelete('cascade'),
    index('task_comments_task_created_index').on(
      table.organizationId,
      table.taskId,
      table.createdAt,
      table.id,
    ),
    check(
      'task_comments_actor_type_check',
      sql`${table.actorType} in ('user', 'automation', 'git', 'system')`,
    ),
    check('task_comments_actor_id_check', sql`${table.actorId} <> ''`),
    check('task_comments_version_check', sql`${table.version} >= 1`),
    check(
      'task_comments_tombstone_check',
      sql`(${table.deletedAt} is null) = (${table.body} is not null)`,
    ),
    check(
      'task_comments_deleted_mentions_check',
      sql`${table.deletedAt} is null or ${table.mentions} = '[]'::jsonb`,
    ),
    organizationPolicy('task_comments_organization_isolation'),
  ],
);
