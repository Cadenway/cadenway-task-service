/**
 * Interface TaskStanding
 *
 * @description
 * Whether a task is live and the list it is in, as one lean locking read gives it, without the
 * task or its collections: what the restoration of an archive reads of the parent of its root
 * before the domain decides whether the parent takes the root back (`takesRestoredRoot`).
 */
export interface TaskStanding {
  // #region Properties
  /** `false` when the task is in an archive. */
  readonly live: boolean;

  /** The list the task is in now. */
  readonly listId: string;
  // #endregion
}
