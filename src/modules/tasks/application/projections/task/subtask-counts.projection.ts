/**
 * Interface SubtaskCounts
 *
 * @description
 * The direct subtasks of a task: how many, and how many are closed (`done` or `cancelled`).
 */
export interface SubtaskCounts {
  // #region Properties
  /** Direct subtasks. */
  readonly total: number;

  /** Direct subtasks whose status is `done` or `cancelled`. */
  readonly closed: number;
  // #endregion
}
