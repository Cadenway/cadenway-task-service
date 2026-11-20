/** Base error for a rejected goal domain operation. */
export abstract class DomainError extends Error {
  // #region Constructor
  /** Names the error after its concrete class. */
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
  // #endregion
}
