/** A bounded series of saved-view UUIDs to resolve for a reader. */
export interface FavoriteSavedViewsRequest {
  // #region Properties
  /** Tenant of the operation. */
  readonly organizationId: string;

  /** Account of the reader. */
  readonly actorUserId: string;

  /** UUIDs of candidate views. */
  readonly viewIds: readonly string[];
  // #endregion
}
