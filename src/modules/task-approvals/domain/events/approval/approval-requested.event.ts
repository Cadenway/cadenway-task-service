/** An editor opened a round with a roster of eligible reviewers. */
export interface ApprovalRequested {
  // #region Properties
  /** Identifies the fact in the domain. */
  readonly kind: 'approval-requested';

  /** New approval round identifier. */
  readonly roundId: string;

  /** The distinct editors in request order. */
  readonly reviewerUserIds: readonly string[];
  // #endregion
}
