/**
 * Interface ReadOptions
 *
 * @description
 * How a read-only run of the tasks unit of work sees the database.
 */
export interface ReadOptions {
  // #region Properties
  /**
   * `true` when everything the run reads must come from one snapshot (repeatable read), so the
   * several statements of a query agree with each other even while writers commit. By default
   * each statement sees what was committed when it started (read committed).
   */
  readonly snapshot?: boolean;
  // #endregion
}
