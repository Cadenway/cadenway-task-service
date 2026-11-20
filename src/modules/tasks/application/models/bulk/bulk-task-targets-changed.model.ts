/** Bulk preflight discovered more tasks whose locks must be taken in order. */
export class BulkTaskTargetsChanged extends Error {
  // #region Constructor
  /** Identifies a change in the expansion for the transactional retry. */
  public constructor() {
    super('The bulk task expansion changed while its locks were acquired.');
    this.name = 'BulkTaskTargetsChanged';
  }
  // #endregion
}
