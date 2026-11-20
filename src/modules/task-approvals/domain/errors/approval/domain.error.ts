/** Base of the failures raised by the approval domain. */
export abstract class DomainError extends Error {
  // #region Constructor
  /** Names the error after its class. */
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
  // #endregion
}
