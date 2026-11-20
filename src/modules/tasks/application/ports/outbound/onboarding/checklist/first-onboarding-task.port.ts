/** Updates the actor's onboarding checklist in the current tenant transaction. */
export interface FirstOnboardingTask {
  // #region Methods
  /** Marks a normal task created by the actor in their provisioned space. */
  record(organizationId: string, actorUserId: string, spaceId: string): Promise<void>;
  // #endregion
}
