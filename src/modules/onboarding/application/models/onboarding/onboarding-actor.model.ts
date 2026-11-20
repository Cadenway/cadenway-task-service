/** The target and actor from the verified organization context. */
export interface OnboardingActor {
  // #region Properties
  /** State used by this operation. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly userId: string;
  // #endregion
}
