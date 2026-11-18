/**
 * Interface UnassignTaskOutput
 *
 * @description
 * What the route answers with, `204` and an `ETag`: the version of the task after the removal, the
 * current one when the account was not assigned.
 */
export interface UnassignTaskOutput {
  // #region Properties
  /** The version of the task. */
  readonly version: number;
  // #endregion
}
