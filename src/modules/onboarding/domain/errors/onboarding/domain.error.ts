/** Base of errors for invalid onboarding state and transitions. */
export abstract class DomainError extends Error {
  // #region Constructor
  /** Sets the type name and describes the rule without exposing any user data. */
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
  // #endregion
}
