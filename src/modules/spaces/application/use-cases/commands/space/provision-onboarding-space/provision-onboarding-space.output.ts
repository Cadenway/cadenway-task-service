/** The created space and its preset lists in their creation order. */
export interface ProvisionOnboardingSpaceOutput {
  // #region Properties
  /** The provisioned space and its ordered lists. */
  readonly spaceId: string;
  readonly listIds: readonly string[];
  // #endregion
}
