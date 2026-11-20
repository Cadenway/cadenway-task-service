/** A refusal translated by the HTTP adapter to a published problem code. */
export class OnboardingRefusal extends Error {
  // #region Constructor
  /** Initializes the operation. */
  public constructor(
    public readonly reason:
      | 'user-not-found'
      | 'organization-not-found'
      | 'role-forbidden'
      | 'version-mismatch'
      | 'wizard-closed'
      | 'checklist-unavailable'
      | 'invalid-draft',
    public readonly version?: number,
  ) {
    super(`Onboarding refused the request (${reason}).`);
  }
  // #endregion
}
