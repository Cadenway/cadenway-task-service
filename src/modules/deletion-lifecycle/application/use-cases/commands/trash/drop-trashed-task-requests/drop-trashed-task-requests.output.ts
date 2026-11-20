/**
 * Interface DropTrashedTaskRequestsOutput
 *
 * @description
 * What the job of the requests of a trash entry did, with counts only.
 */
export interface DropTrashedTaskRequestsOutput {
  // #region Properties
  /** The pending task requests deleted; 0 when a previous attempt already dropped them. */
  readonly dropped: number;

  /**
   * The tasks of the entry found out of the trash (restored before the job ran), whose requests
   * stay.
   */
  readonly untrashed: number;
  // #endregion
}
