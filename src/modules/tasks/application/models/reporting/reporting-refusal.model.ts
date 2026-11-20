/** A report error the HTTP adapter maps to its contract problem. */
export class ReportingRefusal extends Error {
  // #region Constructor
  /** Binds the report dependencies. */
  public constructor(public readonly reason: 'export-row-limit-reached' | 'sheet-column-invalid') {
    super(reason);
    this.name = 'ReportingRefusal';
  }
  // #endregion
}
