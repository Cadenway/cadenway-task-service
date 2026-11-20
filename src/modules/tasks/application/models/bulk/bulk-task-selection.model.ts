/** One explicitly selected task and its optional version precondition. */
export interface BulkTaskSelection {
  // #region Properties
  /** A stable key in the current organization. */
  readonly taskKey: string;

  /** If specified, the version the actor edited. */
  readonly version?: number | undefined;
  // #endregion
}
