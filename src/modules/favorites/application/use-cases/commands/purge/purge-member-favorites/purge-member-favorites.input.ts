/** The tenant and user account identified by a membership-removal event. */
export interface PurgeMemberFavoritesInput {
  // #region Properties
  /** Tenant the actor departed. */
  readonly organizationId: string;

  /** Departed user's account. */
  readonly userId: string;
  // #endregion
}
