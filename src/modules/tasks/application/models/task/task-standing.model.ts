/**
 * Interface TaskStanding
 *
 * @description
 * Whether a task is live and the list it is in, as one lean locking read gives it, without the
 * task or its collections: what the restoration of an archive or of a trash entry reads of the
 * parent of its root before the domain decides whether the parent takes the root back
 * (`takesRestoredRoot`).
 */
export interface TaskStanding {
  // #region Properties
  /** `false` when the task is in an archive or in the trash. */
  readonly live: boolean;

  /** `true` when the task is in the trash, archived or not. */
  readonly inTrash: boolean;

  /** The list the task is in now. */
  readonly listId: string;
  // #endregion
}
