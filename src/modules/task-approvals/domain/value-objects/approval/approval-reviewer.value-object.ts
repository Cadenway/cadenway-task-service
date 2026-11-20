import type { RecordedApprovalVote } from './recorded-approval-vote.value-object.js';

/** A requested editor and their optional current vote, in the submitted roster order. */
export interface ApprovalReviewer {
  // #region Properties
  /** Stable account identifier. */
  readonly reviewerUserId: string;

  /** The recorded vote, or null while waiting. */
  readonly vote: RecordedApprovalVote | null;
  // #endregion
}
