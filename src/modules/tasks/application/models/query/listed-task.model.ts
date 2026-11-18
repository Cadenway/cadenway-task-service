import type { TaskSummaryView } from '../../projections/task/task-summary.projection.js';
import type { TaskPosition } from './task-position.model.js';

/**
 * Interface ListedTask
 *
 * @description
 * A task a page read, with the position a next page would start after it, so that the use case
 * cuts the page without knowing what the order sorts by.
 */
export interface ListedTask {
  // #region Properties
  /** The task as a row of a list shows it. */
  readonly task: TaskSummaryView;

  /** Where a page starts after this task. */
  readonly position: TaskPosition;
  // #endregion
}
