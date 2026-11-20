/** A refusal because the requested action would affect too many task rows. */
export class BulkTaskExpansionError extends Error {
  // #region Properties
  /** Maximum distinct affected rows in one bulk action (P3b-2 decision 18). */
  public static readonly maxAffected = 1000;

  /** The capacity disclosed in the response. */
  public readonly limit = BulkTaskExpansionError.maxAffected;
  // #endregion

  // #region Constructor
  /** Reports the capacity without naming any tasks in the expansion. */
  public constructor() {
    super('The bulk action would affect more than 1000 tasks.');
    this.name = 'BulkTaskExpansionError';
  }
  // #endregion
}
