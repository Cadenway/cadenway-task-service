/** Refusal used by the HTTP adapter without exposing field values. */
export class CustomFieldRefusal extends Error {
  // #region Constructor
  /** Supplies the dependencies of this operation. */
  public constructor(
    public readonly reason:
      | 'manage-forbidden'
      | 'not-found'
      | 'limit-reached'
      | 'position-invalid'
      | 'sprint-points-invalid'
      | 'value-invalid'
      | 'definition-invalid'
      | 'version-mismatch',
    public readonly version?: number,
  ) {
    super(`The custom field operation was refused (${reason}).`);
    this.name = 'CustomFieldRefusal';
  }
  // #endregion
}
