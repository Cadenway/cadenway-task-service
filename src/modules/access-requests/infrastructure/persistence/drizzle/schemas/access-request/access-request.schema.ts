import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Table `access_requests`: the requests for access (P3b-1, "Demander l’accès") to a space, a list
 * or a task, stored only when the target exists and the requester has no role on it. `target_id`
 * is the id of the space, the list or the task asked for; `space_id` and `list_id` (the list of a
 * list or a task target, `null` for a space) are what the people who manage the target filter on;
 * `task_id` and `task_key` name a task target (a key never changes). `space_id`, `list_id` and
 * `task_id` name rows of other modules without a foreign key: the strict layout forbids importing
 * their schemas, and none is deleted in this version (the deletions of PR 3 drop the requests of
 * what they delete). A request changes once, from `pending` to `approved` (with `role`) or
 * `refused`, which the checks keep whole. `access_requests_pending_unique` keeps one pending
 * request per requester and target ("asking again changes nothing") and serves the clean-up of a
 * removed member; `access_requests_pending_index` serves the listing of the pending requests, the
 * most recent first. A tenant table: `organization_id` carries the policy of the kit, which the
 * migration forces by hand (`ALTER TABLE "access_requests" FORCE ROW LEVEL SECURITY;`).
 */
export const accessRequests = pgTable(
  'access_requests',
  {
    organizationId: uuid('organization_id').notNull(),
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    target: text('target').notNull(),
    targetId: uuid('target_id').notNull(),
    spaceId: uuid('space_id').notNull(),
    listId: uuid('list_id'),
    taskId: uuid('task_id'),
    taskKey: text('task_key'),
    requesterUserId: uuid('requester_user_id').notNull(),
    message: text('message'),
    state: text('state').notNull().default('pending'),
    role: text('role'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true, precision: 3 }),
    decidedByType: text('decided_by_type'),
    decidedById: text('decided_by_id'),
  },
  (table) => [
    primaryKey({ name: 'access_requests_pkey', columns: [table.organizationId, table.id] }),
    uniqueIndex('access_requests_pending_unique')
      .on(table.organizationId, table.requesterUserId, table.target, table.targetId)
      .where(sql`${table.state} = 'pending'`),
    index('access_requests_pending_index')
      .on(table.organizationId, table.createdAt, table.id)
      .where(sql`${table.state} = 'pending'`),
    check('access_requests_target_check', sql`${table.target} in ('space', 'list', 'task')`),
    check(
      'access_requests_target_shape_check',
      sql`(${table.target} = 'space' and ${table.targetId} = ${table.spaceId} and ${table.listId} is null and ${table.taskId} is null and ${table.taskKey} is null)
        or (${table.target} = 'list' and ${table.targetId} = ${table.listId} and ${table.taskId} is null and ${table.taskKey} is null)
        or (${table.target} = 'task' and ${table.targetId} = ${table.taskId} and ${table.listId} is not null and ${table.taskKey} ~ '^[A-Z]{2,5}-[1-9][0-9]{0,8}$')`,
    ),
    check('access_requests_state_check', sql`${table.state} in ('pending', 'approved', 'refused')`),
    check(
      'access_requests_role_check',
      sql`(${table.state} = 'approved') = (${table.role} is not null) and (${table.role} is null or ${table.role} in ('edit', 'comment', 'view'))`,
    ),
    check(
      'access_requests_decision_check',
      sql`(${table.state} = 'pending') = (${table.decidedAt} is null)
        and (${table.decidedAt} is null) = (${table.decidedByType} is null)
        and (${table.decidedAt} is null) = (${table.decidedById} is null)
        and (${table.decidedByType} is null or ${table.decidedByType} in ('user', 'automation', 'git', 'system'))`,
    ),
    organizationPolicy('access_requests_organization_isolation'),
  ],
);
