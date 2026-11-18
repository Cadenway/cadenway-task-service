import type { TaskPosition } from '../../models/query/task-position.model.js';
import type { TaskSummaryView } from '../task/task-summary.projection.js';
import type { MyTaskCountsView } from './my-task-counts.projection.js';

/**
 * Interface MyTaskPage
 *
 * @description
 * One page of the tasks assigned to the actor, by due date (undated last), with the counts of both
 * tabs.
 */
export interface MyTaskPage {
  // #region Properties
  /** The tasks of the page. */
  readonly items: readonly TaskSummaryView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: TaskPosition | null;

  /** How many tasks each tab holds, on every page. */
  readonly counts: MyTaskCountsView;
  // #endregion
}
