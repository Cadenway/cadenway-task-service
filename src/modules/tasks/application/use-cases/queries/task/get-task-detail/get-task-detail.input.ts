/**
 * Interface GetTaskDetailInput
 *
 * @description
 * The task whose detail is read.
 */
export interface GetTaskDetailInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;
  // #endregion
}
