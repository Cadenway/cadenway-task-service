import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
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

import { taskApprovalRounds } from './task-approval-round.schema.js';

/** Each ordered reviewer has one optional vote. Reasons remain in task comments. */
export const taskApprovalReviewers = pgTable(
  'task_approval_reviewers',
  {
    organizationId: uuid('organization_id').notNull(),
    roundId: uuid('round_id').notNull(),
    reviewerUserId: uuid('reviewer_user_id').notNull(),
    position: integer('position').notNull(),
    decision: text('decision'),
    decidedAt: timestamp('decided_at', { withTimezone: true, precision: 3 }),
    commentId: uuid('comment_id'),
  },
  (table) => [
    primaryKey({
      name: 'task_approval_reviewers_pkey',
      columns: [table.organizationId, table.roundId, table.reviewerUserId],
    }),
    unique('task_approval_reviewers_position_unique').on(
      table.organizationId,
      table.roundId,
      table.position,
    ),
    foreignKey({
      name: 'task_approval_reviewers_round_fkey',
      columns: [table.organizationId, table.roundId],
      foreignColumns: [taskApprovalRounds.organizationId, taskApprovalRounds.id],
    }).onDelete('cascade'),
    check('task_approval_reviewers_position_check', sql`${table.position} between 0 and 19`),
    check(
      'task_approval_reviewers_vote_check',
      sql`(${table.decision} is null and ${table.decidedAt} is null and ${table.commentId} is null)
        or (${table.decision} is not distinct from 'approved' and ${table.decidedAt} is not null and ${table.commentId} is null)
        or (${table.decision} is not distinct from 'changes-requested' and ${table.decidedAt} is not null and ${table.commentId} is not null)`,
    ),
    organizationPolicy('task_approval_reviewers_organization_isolation'),
  ],
);
