/** A candidate saved view to resolve for the reader. */
export interface FavoriteSavedViewRequest {
  // #region Properties
  /** Tenant of the operation. */
  readonly organizationId: string;

  /** Account of the reader. */
  readonly actorUserId: string;

  /** UUID of the candidate view. */
  readonly viewId: string;

  /** Whether to hold the target and its permissions through commit. */
  readonly lock?: boolean;
  // #endregion
}
