/**
 * Interface RemoveTaskLabelInput
 *
 * @description
 * A label to remove from a task.
 */
export interface RemoveTaskLabelInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;

  /** The label, as the request sent it; compared ignoring case. */
  readonly name: string;

  /** The versions `If-Match` accepts, `null` when absent or `*`. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
