import { ApprovalError } from '../../errors/approval/approval.error.js';
import type { ApprovalDecided } from '../../events/approval/approval-decided.event.js';
import type { ApprovalRequested } from '../../events/approval/approval-requested.event.js';
import { validateApprovalChangeReason } from '../../policies/approval/approval-change-reason.policy.js';
import type { ApprovalReviewer } from '../../value-objects/approval/approval-reviewer.value-object.js';
import type { ApprovalRoundState } from '../../value-objects/approval/approval-round-state.value-object.js';
import type { ApprovalRoundView } from '../../value-objects/approval/approval-round-view.value-object.js';
import type { RecordedApprovalVote } from '../../value-objects/approval/recorded-approval-vote.value-object.js';

type ApprovalRequest = Omit<ApprovalRoundState, 'reviewers'> & {
  readonly reviewerUserIds: readonly string[];
};

interface CastApprovalVote {
  // #region Properties
  /** Account casting the vote. */
  readonly reviewerUserId: string;

  /** Editors resolved under the task's current access rules. */
  readonly eligibleReviewerIds: ReadonlySet<string>;

  /** Vote instant supplied by the transaction. */
  readonly decidedAt: Date;

  /** Submitted decision and comment link when requesting changes. */
  readonly vote:
    | { readonly decision: 'approved' }
    | {
        readonly decision: 'changes-requested';
        readonly reason: string;
        readonly commentId: string;
      };
  // #endregion
}

/** Checks the roster bounds of `TaskApprovalRequest` in `components/approval.yaml`. */
function validRoster(reviewerUserIds: readonly string[]): boolean {
  return (
    reviewerUserIds.length >= 1 &&
    reviewerUserIds.length <= 20 &&
    reviewerUserIds.every((id) => id !== '') &&
    new Set(reviewerUserIds).size === reviewerUserIds.length
  );
}

/** Ensures that only a request for changes refers to a comment. */
function validVote(vote: RecordedApprovalVote | null): boolean {
  if (vote === null) return true;
  return (
    Number.isFinite(vote.decidedAt.getTime()) &&
    (vote.decision !== 'changes-requested' || vote.commentId !== '')
  );
}

/** Applies approval precedence from `TaskApprovalRound` in `components/approval.yaml`. */
function outcome(reviewers: ApprovalRoundView['reviewers']): ApprovalRoundView['status'] {
  if (reviewers.some(({ decision }) => decision === 'changes-requested'))
    return 'changes-requested';
  if (reviewers.length > 0 && reviewers.every(({ decision }) => decision === 'approved')) {
    return 'approved';
  }
  return 'pending';
}

/**
 * One approval round and its ordered roster (P3c-1 decision 4, mockup `App.dc.html` 5038–5106).
 * Use cases supply eligible editors with canonical account IDs and serialize operations under
 * the task version. They apply the resulting status through the normal task transition rules.
 */
export class ApprovalRound {
  // #region Properties
  /** Stored state, including votes omitted from the eligible view. */
  public readonly snapshot: ApprovalRoundState;
  // #endregion

  // #region Constructor
  /** Keeps validated round state. */
  private constructor(state: ApprovalRoundState) {
    this.snapshot = state;
  }
  // #endregion

  // #region Methods
  /**
   * Opens a round with unique eligible reviewers and no votes. Starting a new round leaves an
   * earlier round's history intact. The use case stores which round is current.
   */
  public static request(
    { reviewerUserIds, ...identity }: ApprovalRequest,
    eligibleReviewerIds: ReadonlySet<string>,
  ): { readonly round: ApprovalRound; readonly event: ApprovalRequested } {
    const reviewerIds: readonly string[] = reviewerUserIds.map((id) => id.toLowerCase());
    if (!validRoster(reviewerIds) || !reviewerIds.every((id) => eligibleReviewerIds.has(id))) {
      throw new ApprovalError('reviewer-invalid');
    }

    const round: ApprovalRound = ApprovalRound.restore({
      ...identity,
      reviewers: reviewerIds.map((reviewerUserId) => ({ reviewerUserId, vote: null })),
    });
    return {
      round,
      event: {
        kind: 'approval-requested',
        roundId: round.snapshot.id,
        reviewerUserIds: reviewerIds,
      },
    };
  }

  /** Reconstructs a persisted round and validates its stored roster and votes. */
  public static restore(state: ApprovalRoundState): ApprovalRound {
    const reviewers: readonly ApprovalReviewer[] = state.reviewers.map(
      ({ reviewerUserId, vote }) => ({
        reviewerUserId: reviewerUserId.toLowerCase(),
        vote,
      }),
    );
    if (
      !state.id ||
      !state.organizationId ||
      !state.taskId ||
      !state.requesterUserId ||
      !Number.isFinite(state.requestedAt.getTime()) ||
      !validRoster(reviewers.map(({ reviewerUserId }) => reviewerUserId)) ||
      !reviewers.every(({ vote }) => validVote(vote))
    ) {
      throw new ApprovalError('invalid-state');
    }
    return new ApprovalRound({
      ...state,
      requesterUserId: state.requesterUserId.toLowerCase(),
      reviewers,
    });
  }

  /**
   * Projects only eligible reviewers, retaining their original order (internal
   * `getTaskApprovalInternal`). A round with no eligible reviewers stays pending.
   */
  public view(eligibleReviewerIds: ReadonlySet<string>): ApprovalRoundView {
    const reviewers: ApprovalRoundView['reviewers'] = this.snapshot.reviewers
      .filter(({ reviewerUserId }) => eligibleReviewerIds.has(reviewerUserId))
      .map(({ reviewerUserId, vote }) => ({
        reviewerUserId,
        decision: vote?.decision ?? null,
        decidedAt: vote?.decidedAt ?? null,
        commentId: vote?.commentId ?? null,
      }));
    return {
      roundId: this.snapshot.id,
      requesterUserId: this.snapshot.requesterUserId,
      requestedAt: this.snapshot.requestedAt,
      status: outcome(reviewers),
      reviewers,
    };
  }

  /** Checks reviewer eligibility and the vote slot before a change-request comment is created. */
  public assertCanCastVote(reviewerUserId: string, eligibleReviewerIds: ReadonlySet<string>): void {
    const reviewer: ApprovalReviewer = this.findReviewer(reviewerUserId, eligibleReviewerIds);
    if (reviewer.vote !== null) throw new ApprovalError('vote-already-recorded');
  }

  /** Records a fresh vote and supplies the status requested by `voteOnTaskApprovalInternal`. */
  public castVote(input: CastApprovalVote): {
    readonly round: ApprovalRound;
    readonly taskStatus: 'progress' | 'done' | null;
    readonly event: ApprovalDecided;
  } {
    this.assertCanCastVote(input.reviewerUserId, input.eligibleReviewerIds);
    const reviewerUserId: string = input.reviewerUserId.toLowerCase();
    const vote: RecordedApprovalVote = this.recordedVote(input);
    const round: ApprovalRound = this.replaceVote(reviewerUserId, vote);
    const taskStatus: 'progress' | 'done' | null =
      vote.decision === 'changes-requested'
        ? 'progress'
        : round.view(input.eligibleReviewerIds).status === 'approved'
          ? 'done'
          : null;
    return { round, taskStatus, event: this.decided(reviewerUserId, vote) };
  }

  /**
   * Removes the caller's vote only. Existing comments and task status are unchanged (internal
   * `withdrawTaskApprovalVoteInternal`). Returns null without an event if the slot is empty.
   */
  public withdrawVote(
    reviewerUserId: string,
    eligibleReviewerIds: ReadonlySet<string>,
  ): { readonly round: ApprovalRound; readonly event: ApprovalDecided } | null {
    const reviewer: ApprovalReviewer = this.findReviewer(reviewerUserId, eligibleReviewerIds);
    if (reviewer.vote === null) return null;
    return {
      round: this.replaceVote(reviewer.reviewerUserId, null),
      event: this.decided(reviewer.reviewerUserId, null),
    };
  }

  private findReviewer(
    reviewerUserId: string,
    eligibleReviewerIds: ReadonlySet<string>,
  ): ApprovalReviewer {
    const id: string = reviewerUserId.toLowerCase();
    const reviewer: ApprovalReviewer | undefined = this.snapshot.reviewers.find(
      (candidate) => candidate.reviewerUserId === id,
    );
    if (reviewer === undefined || !eligibleReviewerIds.has(id)) {
      throw new ApprovalError('reviewer-required');
    }
    return reviewer;
  }

  private recordedVote({ decidedAt, vote }: CastApprovalVote): RecordedApprovalVote {
    if (vote.decision === 'approved') return { decision: 'approved', decidedAt, commentId: null };
    validateApprovalChangeReason(vote.reason);
    return { decision: 'changes-requested', decidedAt, commentId: vote.commentId };
  }

  private replaceVote(reviewerUserId: string, vote: RecordedApprovalVote | null): ApprovalRound {
    return ApprovalRound.restore({
      ...this.snapshot,
      reviewers: this.snapshot.reviewers.map((reviewer) =>
        reviewer.reviewerUserId === reviewerUserId ? { reviewerUserId, vote } : reviewer,
      ),
    });
  }

  private decided(reviewerUserId: string, vote: RecordedApprovalVote | null): ApprovalDecided {
    const identity = {
      kind: 'approval-decided',
      roundId: this.snapshot.id,
      requesterUserId: this.snapshot.requesterUserId,
      reviewerUserId,
    } as const;
    if (vote?.decision === 'changes-requested') {
      return { ...identity, decision: 'changes-requested', commentId: vote.commentId };
    }
    return { ...identity, decision: vote === null ? 'withdrawn' : 'approved', commentId: null };
  }
  // #endregion
}
