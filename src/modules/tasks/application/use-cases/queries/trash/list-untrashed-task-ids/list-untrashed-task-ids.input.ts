/**
 * Interface ListUntrashedTaskIdsInput
 *
 * @description
 * The tasks of an entry whose pending access requests the deletion-lifecycle job is about to drop.
 */
export interface ListUntrashedTaskIdsInput {
  // #region Properties
  /** The organization of the job. */
  readonly organizationId: string;

  /** The ids of the tasks, 2,000 at most. */
  readonly taskIds: readonly string[];
  // #endregion
}
