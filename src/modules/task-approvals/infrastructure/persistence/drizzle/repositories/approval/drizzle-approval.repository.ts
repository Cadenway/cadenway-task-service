import type { DatabaseSchema, TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { ApprovalRound } from '../../../../../domain/aggregates/approval/approval-round.aggregate.js';
import type { ApprovalReviewer } from '../../../../../domain/value-objects/approval/approval-reviewer.value-object.js';
import type { RecordedApprovalVote } from '../../../../../domain/value-objects/approval/recorded-approval-vote.value-object.js';
import { taskApprovalReviewers } from '../../schemas/approval/task-approval-reviewer.schema.js';
import { taskApprovalRounds } from '../../schemas/approval/task-approval-round.schema.js';

/** Approval storage bound to the use case's tenant transaction. */
export class DrizzleApprovalRepository {
  // #region Properties
  /** The database of the current tenant transaction. */
  private readonly db: TransactionDatabase<DatabaseSchema>;
  // #endregion

  // #region Constructor
  /** Binds storage to the current transaction. */
  public constructor(db: TransactionDatabase<DatabaseSchema>) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /** Allocates the round identifier using PostgreSQL. */
  public async allocateId(): Promise<string> {
    const result = await this.db.execute<{ id: string }>(sql`select uuidv7()::text as id`);
    const id = result.rows[0]?.id;
    if (id === undefined) throw new Error('The database did not allocate an approval round ID.');
    return id;
  }

  /** Reads the current round and at most twenty reviewers in request order. */
  public async findCurrent(organizationId: string, taskId: string): Promise<ApprovalRound | null> {
    const rows = await this.db
      .select({ round: taskApprovalRounds, reviewer: taskApprovalReviewers })
      .from(taskApprovalRounds)
      .innerJoin(
        taskApprovalReviewers,
        and(
          eq(taskApprovalReviewers.organizationId, taskApprovalRounds.organizationId),
          eq(taskApprovalReviewers.roundId, taskApprovalRounds.id),
        ),
      )
      .where(
        and(
          eq(taskApprovalRounds.organizationId, organizationId),
          eq(taskApprovalRounds.taskId, taskId),
          isNull(taskApprovalRounds.closedAt),
        ),
      )
      .orderBy(asc(taskApprovalReviewers.position))
      .limit(20);
    const first = rows[0];
    if (first === undefined) return null;
    const reviewers: ApprovalReviewer[] = rows.map(({ reviewer }) => ({
      reviewerUserId: reviewer.reviewerUserId,
      vote: this.toVote(reviewer),
    }));
    return ApprovalRound.restore({
      id: first.round.id,
      organizationId: first.round.organizationId,
      taskId: first.round.taskId,
      requesterUserId: first.round.requesterUserId,
      requestedAt: first.round.requestedAt,
      reviewers,
    });
  }

  /** Replaces the current round under the caller's task lock, keeping its history. */
  public async replaceCurrent(round: ApprovalRound, closedAt: Date): Promise<void> {
    const state = round.snapshot;
    await this.db
      .update(taskApprovalRounds)
      .set({ closedAt })
      .where(
        and(
          eq(taskApprovalRounds.organizationId, state.organizationId),
          eq(taskApprovalRounds.taskId, state.taskId),
          isNull(taskApprovalRounds.closedAt),
        ),
      );
    await this.db.insert(taskApprovalRounds).values({
      organizationId: state.organizationId,
      id: state.id,
      taskId: state.taskId,
      requesterUserId: state.requesterUserId,
      requestedAt: state.requestedAt,
    });
    await this.db.insert(taskApprovalReviewers).values(
      state.reviewers.map(({ reviewerUserId, vote }, position) => ({
        organizationId: state.organizationId,
        roundId: state.id,
        reviewerUserId,
        position,
        decision: vote?.decision ?? null,
        decidedAt: vote?.decidedAt ?? null,
        commentId: vote?.commentId ?? null,
      })),
    );
  }

  /** Saves one reviewer's vote only while this round remains current on the same task. */
  public async saveVote(round: ApprovalRound, reviewerUserId: string): Promise<boolean> {
    const state = round.snapshot;
    const reviewer = state.reviewers.find(
      (candidate) => candidate.reviewerUserId === reviewerUserId,
    );
    if (reviewer === undefined) throw new Error('The reviewer does not belong to this round.');
    const rows = await this.db
      .update(taskApprovalReviewers)
      .set({
        decision: reviewer.vote?.decision ?? null,
        decidedAt: reviewer.vote?.decidedAt ?? null,
        commentId: reviewer.vote?.commentId ?? null,
      })
      .where(
        and(
          eq(taskApprovalReviewers.organizationId, state.organizationId),
          eq(taskApprovalReviewers.roundId, state.id),
          eq(taskApprovalReviewers.reviewerUserId, reviewerUserId),
          sql`exists (select 1 from ${taskApprovalRounds} where
            ${taskApprovalRounds.organizationId} = ${state.organizationId}::uuid
            and ${taskApprovalRounds.id} = ${state.id}::uuid
            and ${taskApprovalRounds.taskId} = ${state.taskId}::uuid
            and ${taskApprovalRounds.closedAt} is null)`,
        ),
      )
      .returning({ id: taskApprovalReviewers.reviewerUserId });
    return rows.length === 1;
  }

  /** Reconstitutes the vote shape guaranteed by the database constraint. */
  private toVote(row: typeof taskApprovalReviewers.$inferSelect): RecordedApprovalVote | null {
    if (row.decision === null && row.decidedAt === null && row.commentId === null) return null;
    if (row.decision === 'approved' && row.decidedAt !== null && row.commentId === null) {
      return { decision: 'approved', decidedAt: row.decidedAt, commentId: null };
    }
    if (row.decision === 'changes-requested' && row.decidedAt !== null && row.commentId !== null) {
      return { decision: 'changes-requested', decidedAt: row.decidedAt, commentId: row.commentId };
    }
    throw new Error('The stored approval vote is invalid.');
  }
  // #endregion
}
