/** One bounded keyset read inside a stable tenant snapshot. */
export interface ReportingBatch<T> {
  // #region Properties
  /** Report data and dependencies. */
  readonly items: readonly T[];
  readonly next: string | null;
  // #endregion
}
