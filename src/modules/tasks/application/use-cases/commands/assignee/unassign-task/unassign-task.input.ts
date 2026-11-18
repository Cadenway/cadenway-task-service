/**
 * Interface UnassignTaskInput
 *
 * @description
 * The removal of an account from the assignees of a task.
 */
export interface UnassignTaskInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;

  /** The account to remove. */
  readonly userId: string;

  /** The versions `If-Match` accepts, `null` when absent or `*`. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
