/** A merged sheet sort needs a column or custom field ID as well as a direction. */
export class IncompleteSheetSort extends Error {
  // #region Constructor
  /** Identifies the presentation setting that remained incomplete after merging. */
  public constructor(
    message: string,
    public readonly field: 'sheetSort' | 'customFieldSort' = 'sheetSort',
  ) {
    super(message);
  }
  // #endregion
}
