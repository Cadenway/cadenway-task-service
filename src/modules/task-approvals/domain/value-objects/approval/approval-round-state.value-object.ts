import type { ApprovalReviewer } from './approval-reviewer.value-object.js';

/** Stored approval round, including reviewers that are currently unable to edit the task. */
export interface ApprovalRoundState {
  // #region Properties
  /** Stable approval round identifier. */
  readonly id: string;

  /** Tenant that owns the round. */
  readonly organizationId: string;

  /** Stable identifier of the task that owns the round. */
  readonly taskId: string;

  /** Account that opened the round. */
  readonly requesterUserId: string;

  /** Instant supplied on creation by the use case. */
  readonly requestedAt: Date;

  /** Requested reviewers in the original order, with at most one vote each. */
  readonly reviewers: readonly ApprovalReviewer[];
  // #endregion
}
