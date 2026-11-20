import type { RecordedApprovalVote } from './recorded-approval-vote.value-object.js';

/** State and outcome for reviewers that can edit the task at the time of projection. */
export interface ApprovalRoundView {
  // #region Properties
  /** Stable approval round identifier. */
  readonly roundId: string;

  /** Account that opened the round. */
  readonly requesterUserId: string;

  /** Instant the round was opened. */
  readonly requestedAt: Date;

  /** Outcome derived from eligible votes. */
  readonly status: 'pending' | 'approved' | 'changes-requested';

  /** Eligible reviewers in the submitted order. */
  readonly reviewers: readonly {
    readonly reviewerUserId: string;
    readonly decision: RecordedApprovalVote['decision'] | null;
    readonly decidedAt: Date | null;
    readonly commentId: string | null;
  }[];
  // #endregion
}
