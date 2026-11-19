/**
 * Interface TaskPlacement
 *
 * @description
 * Where the task of a task request is now: its current list and the space of that list, as the
 * tasks module locates it. A task request concerns the list the task is in now, not the one it was
 * in when it was asked for ("the list of the task for a task" of `openapi/public/access.yaml`).
 */
export interface TaskPlacement {
  // #region Properties
  /**
   * Property spaceId
   *
   * @description
   * The space of the current list of the task.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property listId
   *
   * @description
   * The current list of the task.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;
  // #endregion
}
