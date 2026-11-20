/** The tenant and verified user from the internal request context. */
export interface GoalCaller {
  // #region Properties
  /** The members of this application contract. */
  readonly organizationId: string;
  readonly userId: string;
  // #endregion
}
