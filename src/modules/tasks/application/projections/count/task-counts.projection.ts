/**
 * Interface TaskCountsView
 *
 * @description
 * The counts of the top-level tasks of a list, subtasks left out (`TaskCounts` of
 * `openapi/internal/task-service.yaml:3307-3341`).
 */
export interface TaskCountsView {
  // #region Properties
  /** Every top-level task of the list. */
  readonly total: number;

  /** The tasks that are not closed (the categories `open` and `active`). */
  readonly open: number;

  /** The tasks of the key `done` ("Terminées"). */
  readonly done: number;

  /** The tasks of the key `cancelled`. */
  readonly cancelled: number;

  /** The tasks that are not closed and due strictly before the `today` of the request. */
  readonly late: number;
  // #endregion
}
