/**
 * Interface TrashTaskInput
 *
 * @description
 * The deletion of a task with its live subtasks ("Supprimer la tâche").
 */
export interface TrashTaskInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;

  /** The versions `If-Match` accepts, `null` when absent or `*`. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
