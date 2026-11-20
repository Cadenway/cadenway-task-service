/** Removes the private favorites of a former organization member. */
export interface MemberFavorites {
  // #region Methods
  /** Rechecks membership under lock before removing the member's favorites. */
  purge(organizationId: string, userId: string): Promise<void>;
  // #endregion
}
