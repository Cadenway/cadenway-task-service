/** Account and task key of the last returned report row. Null denotes the unassigned bucket. */
export interface ReportingPosition {
  // #region Properties
  /** Report data and dependencies. */
  readonly userId: string | null;
  readonly taskKey: string;
  // #endregion
}
