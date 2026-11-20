/** An insufficient list role, for the contract's role and requiredRole details. */
export class IntakeAccessError extends Error {
  // #region Constructor
  /** Retains the effective role checked by the form aggregate. */
  public constructor(public readonly role: 'edit' | 'comment' | 'view') {
    super('The intake form requires list edit access.');
    this.name = 'IntakeAccessError';
  }
  // #endregion

  // #region Properties
  /** The role required by each management operation. */
  public readonly requiredRole = 'edit' as const;
  // #endregion
}
