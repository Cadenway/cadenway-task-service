import type { TaskPosition } from '../../models/query/task-position.model.js';
import type { TaskSummaryView } from '../task/task-summary.projection.js';

/**
 * Interface TaskSummaryPage
 *
 * @description
 * One page of the tasks of a list, with how many tasks match the filters.
 */
export interface TaskSummaryPage {
  // #region Properties
  /** The tasks of the page. */
  readonly items: readonly TaskSummaryView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: TaskPosition | null;

  /** How many tasks match the filters, whatever the page. */
  readonly total: number;
  // #endregion
}
