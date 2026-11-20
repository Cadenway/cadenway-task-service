/**
 * Interface DropTrashedTaskRequestsInput
 *
 * @description
 * The tasks of one trash entry, as the `task.drop-trashed-task-requests` job carries them.
 */
export interface DropTrashedTaskRequestsInput {
  // #region Properties
  /** The organization of the job, in lower case, the one of its organization context. */
  readonly organizationId: string;

  /**
   * The tasks of the entry, in lower case: 651 live tasks at most, and the archived subtasks of its
   * root, which the product does not limit.
   */
  readonly taskIds: readonly string[];
  // #endregion
}
