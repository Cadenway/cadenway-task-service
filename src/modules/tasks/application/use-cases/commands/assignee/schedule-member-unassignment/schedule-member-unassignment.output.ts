/**
 * Interface ScheduleMemberUnassignmentOutput
 *
 * @description
 * Whether the removal enqueued its unassignment job.
 */
export interface ScheduleMemberUnassignmentOutput {
  // #region Properties
  /** `true` when a job was enqueued, `false` when the same removal had already enqueued one. */
  readonly scheduled: boolean;
  // #endregion
}
