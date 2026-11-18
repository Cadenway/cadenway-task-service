import type { TaskGroupView } from './task-group.projection.js';

/**
 * Interface TaskGroupCountsView
 *
 * @description
 * What the repository counted for a grouping of the tasks of a list: the groups that hold a task
 * and how many tasks match the filters, each counted once (a task with two assignees is in two
 * groups and once in the total).
 */
export interface TaskGroupCountsView {
  // #region Properties
  /** The groups, in any order; those without a task may be left out. */
  readonly groups: readonly TaskGroupView[];

  /** How many tasks match the filters, each counted once. */
  readonly total: number;
  // #endregion
}
