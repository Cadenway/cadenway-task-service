/**
 * Interface RestoredRootParent
 *
 * @description
 * The parent the root of an archive had when it was archived, as the application reads it under
 * lock when the archive is restored: whether it is live, where it is, its level and how many live
 * direct subtasks it has now ("A parent that is no longer live, or can no longer take it (25
 * subtasks, 3 levels), detaches the restored root", "Tasks" of `openapi/public/archives.yaml`).
 */
export interface RestoredRootParent {
  // #region Properties
  /**
   * Property live
   *
   * @description
   * `false` when the parent is archived itself.
   *
   * @type {boolean}
   * @readonly
   */
  readonly live: boolean;

  /**
   * Property listId
   *
   * @description
   * The list the parent is in now: a live parent may have moved since the root was archived.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property level
   *
   * @description
   * Level of the parent: 1 for a top-level task, 2 for a subtask.
   *
   * @type {number}
   * @readonly
   */
  readonly level: number;

  /**
   * Property childCount
   *
   * @description
   * Number of its live direct subtasks, the archived root not counted.
   *
   * @type {number}
   * @readonly
   */
  readonly childCount: number;
  // #endregion
}
