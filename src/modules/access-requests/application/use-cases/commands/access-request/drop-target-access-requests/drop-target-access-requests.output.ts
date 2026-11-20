/**
 * Interface DropTargetAccessRequestsOutput
 *
 * @description
 * How many pending requests the call deleted.
 */
export interface DropTargetAccessRequestsOutput {
  // #region Properties
  /**
   * Property dropped
   *
   * @description
   * The pending requests deleted; 0 when none was left, so a call made again is harmless.
   *
   * @type {number}
   * @readonly
   */
  readonly dropped: number;
  // #endregion
}
