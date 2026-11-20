/** Permission, version, limit, syntax and existence failures exposed by the use cases. */
export type SavedViewFailure =
  | { reason: 'missing-organization' | 'missing-list' | 'missing-view' }
  | { reason: 'role-insufficient'; role: 'comment' | 'view' }
  | { reason: 'list-archived' | 'limit-reached' }
  | { reason: 'incomplete-sheet-sort' }
  | { reason: 'version-mismatch'; version: number };

/** A refused operation, mapped to the published problem by the HTTP adapter. */
export class SavedViewError extends Error {
  // #region Properties
  /** The reason and structured metadata needed by the caller. */
  public readonly failure: SavedViewFailure;
  // #endregion

  // #region Constructor
  /** Keeps problem-independent failure information available to the HTTP adapter. */
  public constructor(failure: SavedViewFailure) {
    super(failure.reason);
    this.failure = failure;
  }
  // #endregion
}
