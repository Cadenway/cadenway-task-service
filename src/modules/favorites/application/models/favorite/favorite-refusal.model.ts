type RefusalReason =
  | 'organization-not-found'
  | 'favorite-not-found'
  | 'target-not-found'
  | 'already-exists'
  | 'limit-reached'
  | 'version-mismatch';

/** Application refusal, mapped to the internal route's Problem response by the presentation layer. */
export class FavoriteRefusal extends Error {
  // #region Properties
  /** Stable reason for the refusal. */
  public readonly reason: RefusalReason;

  /** Current version for a failed precondition. */
  public readonly version: number | undefined;
  // #endregion

  // #region Constructor
  /** Carries the reason and the current version when the precondition failed. */
  public constructor(reason: RefusalReason, version?: number) {
    super(reason);
    this.reason = reason;
    this.version = version;
  }
  // #endregion
}
