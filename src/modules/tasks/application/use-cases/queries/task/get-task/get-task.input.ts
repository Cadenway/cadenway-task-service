/**
 * Interface GetTaskInput
 *
 * @description
 * The task to read.
 */
export interface GetTaskInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;
  // #endregion
}
