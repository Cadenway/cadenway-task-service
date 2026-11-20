/** Tenant and user that own a single favorites collection. */
export interface FavoriteOwner {
  // #region Properties
  /** Tenant derived from the verified context. */
  readonly organizationId: string;

  /** Account that owns the collection. */
  readonly actorUserId: string;
  // #endregion
}
