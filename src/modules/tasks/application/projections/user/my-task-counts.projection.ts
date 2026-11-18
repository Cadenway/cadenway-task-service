/**
 * Interface MyTaskCountsView
 *
 * @description
 * How many tasks each tab of "Mes tâches" holds (`MyTaskCounts` of the contract), subtasks
 * included.
 */
export interface MyTaskCountsView {
  // #region Properties
  /** The assigned tasks that are not closed. */
  readonly open: number;

  /** The assigned tasks of the keys `done` and `cancelled`. */
  readonly closed: number;
  // #endregion
}
