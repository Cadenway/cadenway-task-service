import { ApprovalRound } from '../../../domain/aggregates/approval/approval-round.aggregate.js';
import { ApprovalError } from '../../../domain/errors/approval/approval.error.js';
import { validateApprovalChangeReason } from '../../../domain/policies/approval/approval-change-reason.policy.js';
import type { ApprovalActor } from '../../models/approval/approval-actor.model.js';
import { ApprovalRefusal } from '../../models/approval/approval-refusal.model.js';
import type { ApprovalState } from '../../models/approval/approval-state.model.js';
import type { ApprovalTaskContext } from '../../models/approval/approval-task-context.model.js';
import type { ApprovalComments } from '../../ports/outbound/comments/approval/approval-comments.port.js';
import type { ApprovalEvents } from '../../ports/outbound/messaging/approval/approval-events.port.js';
import type { ApprovalRepository } from '../../ports/outbound/persistence/approval/approval-repository.port.js';
import type { ApprovalTasks } from '../../ports/outbound/tasks/approval/approval-tasks.port.js';

type WriteActor = ApprovalActor & { readonly expectedVersions: readonly number[] | null };
type ApprovalVote =
  | { readonly decision: 'approved' }
  | {
      readonly decision: 'changes-requested';
      readonly reason: string;
    };

/** Orchestrates rounds through the task-owned transaction and its existing status policies. */
export class ApprovalOperations {
  // #region Constructor
  /** Binds the transaction-aware approval ports. */
  public constructor(
    private readonly tasks: ApprovalTasks,
    private readonly repository: ApprovalRepository,
    private readonly comments: ApprovalComments,
    private readonly events: ApprovalEvents,
  ) {}
  // #endregion

  // #region Methods
  /** Reads the current approval in one task snapshot. */
  public read(input: ApprovalActor): Promise<ApprovalState> {
    return this.tasks.read(input, {
      discoverReviewerIds: (taskId) => this.reviewerIds(input.organizationId, taskId),
      read: async (context) => this.state(context, await this.current(context)),
    });
  }

  public request(
    input: WriteActor & { readonly reviewerUserIds: readonly string[] },
  ): Promise<ApprovalState> {
    return this.mapRefusals(() =>
      this.tasks.change(input, {
        discoverReviewerIds: (taskId) => this.reviewerIds(input.organizationId, taskId),
        decide: async (context) => {
          this.requireOrdinary(context);
          const { round, event } = ApprovalRound.request(
            {
              id: await this.repository.allocateId(),
              organizationId: context.organizationId,
              taskId: context.taskId,
              requesterUserId: input.actorUserId,
              requestedAt: context.instant,
              reviewerUserIds: input.reviewerUserIds,
            },
            new Set(context.eligibleReviewerIds),
          );
          return {
            changed: true,
            status: null,
            finish: async (final) => {
              await this.repository.replaceCurrent(round, context.instant);
              await this.events.requested(final, input.actorUserId, event);
              return this.state(final, round);
            },
          };
        },
      }),
    );
  }

  public vote(
    input: WriteActor & { readonly roundId: string; readonly vote: ApprovalVote },
  ): Promise<ApprovalState> {
    return this.mapRefusals(() =>
      this.tasks.change(
        { ...input, reviewerUserIds: [] },
        {
          discoverReviewerIds: (taskId) => this.reviewerIds(input.organizationId, taskId),
          decide: async (context) => {
            this.requireOrdinary(context);
            const current = await this.requireCurrent(context, input.roundId);
            const eligible = new Set(context.eligibleReviewerIds);
            current.assertCanCastVote(input.actorUserId, eligible);
            if (input.vote.decision === 'changes-requested')
              validateApprovalChangeReason(input.vote.reason);
            const vote =
              input.vote.decision === 'changes-requested'
                ? {
                    decision: 'changes-requested' as const,
                    reason: input.vote.reason,
                    commentId: await this.comments.allocateId(),
                  }
                : { decision: 'approved' as const };
            const result = current.castVote({
              reviewerUserId: input.actorUserId,
              eligibleReviewerIds: eligible,
              decidedAt: context.instant,
              vote,
            });
            return {
              changed: true,
              status: result.taskStatus,
              finish: async (final) => {
                if (
                  !(await this.repository.saveVote(result.round, input.actorUserId.toLowerCase()))
                ) {
                  throw new ApprovalRefusal('round-not-found');
                }
                if (vote.decision === 'changes-requested') {
                  await this.comments.create({
                    context: final,
                    commentId: vote.commentId,
                    authorUserId: input.actorUserId,
                    body: vote.reason,
                  });
                }
                await this.events.decided(final, input.actorUserId, result.event);
                return this.state(final, result.round);
              },
            };
          },
        },
      ),
    );
  }

  public withdraw(
    input: WriteActor & { readonly roundId: string },
  ): Promise<{ readonly version: number }> {
    return this.mapRefusals(() =>
      this.tasks.change(
        { ...input, reviewerUserIds: [] },
        {
          discoverReviewerIds: (taskId) => this.reviewerIds(input.organizationId, taskId),
          decide: async (context) => {
            this.requireOrdinary(context);
            const current = await this.requireCurrent(context, input.roundId);
            const result = current.withdrawVote(
              input.actorUserId,
              new Set(context.eligibleReviewerIds),
            );
            return {
              changed: result !== null,
              status: null,
              finish: async (final) => {
                if (result !== null) {
                  if (
                    !(await this.repository.saveVote(result.round, input.actorUserId.toLowerCase()))
                  ) {
                    throw new ApprovalRefusal('round-not-found');
                  }
                  await this.events.decided(final, input.actorUserId, result.event);
                }
                return { version: final.version };
              },
            };
          },
        },
      ),
    );
  }

  private current(context: ApprovalTaskContext): Promise<ApprovalRound | null> {
    return this.repository.findCurrent(context.organizationId, context.taskId);
  }

  private async reviewerIds(organizationId: string, taskId: string): Promise<readonly string[]> {
    const round = await this.repository.findCurrent(organizationId, taskId);
    return round?.snapshot.reviewers.map(({ reviewerUserId }) => reviewerUserId) ?? [];
  }

  private state(context: ApprovalTaskContext, round: ApprovalRound | null): ApprovalState {
    return {
      taskKey: context.taskKey,
      taskVersion: context.version,
      taskStatus: context.status,
      current:
        context.milestone || round === null
          ? null
          : round.view(new Set(context.eligibleReviewerIds)),
    };
  }

  private requireOrdinary(context: ApprovalTaskContext): void {
    if (context.milestone) throw new ApprovalRefusal('milestone-unsupported');
  }

  private async requireCurrent(
    context: ApprovalTaskContext,
    roundId: string,
  ): Promise<ApprovalRound> {
    const round = await this.current(context);
    if (round?.snapshot.id !== roundId.toLowerCase()) throw new ApprovalRefusal('round-not-found');
    return round;
  }

  private async mapRefusals<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (error instanceof ApprovalError && error.reason !== 'invalid-state')
        throw new ApprovalRefusal(error.reason);
      throw error;
    }
  }
  // #endregion
}
