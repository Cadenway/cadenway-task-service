/**
 * Interface UnassignRemovedMemberOutput
 *
 * @description
 * How the unassignment of a former member ended, with counts only.
 */
export interface UnassignRemovedMemberOutput {
  // #region Properties
  /**
   * `completed` once no task is left assigned to the account; `member-again` when the copy holds
   * the account as a member again, so the job stopped and left the remaining tasks as they are.
   */
  readonly outcome: 'completed' | 'member-again';

  /** The number of tasks this run changed, 0 when none. */
  readonly unassigned: number;

  /** The number of batches this run committed. */
  readonly batches: number;
  // #endregion
}
