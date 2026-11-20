/** The ordinary space creation command refused the supplied prefix. */
export class OnboardingPrefixTaken extends Error {
  // #region Constructor
  /** Carries the conflicting prefix for the published request problem. */
  public constructor(public readonly prefix: string) {
    super('The onboarding space prefix is already in use.');
  }
  // #endregion
}
