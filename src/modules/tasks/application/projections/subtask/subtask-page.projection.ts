import type { TaskSummaryView } from '../task/task-summary.projection.js';
import type { PagePosition } from '../../models/page/page-position.model.js';

/**
 * Interface SubtaskPage
 *
 * @description
 * One page of the direct subtasks of a task, in the order of their creation.
 */
export interface SubtaskPage {
  // #region Properties
  /** The subtasks of the page. */
  readonly items: readonly TaskSummaryView[];

  /** Where the next page starts, `null` on the last page. */
  readonly next: PagePosition | null;

  /** How many direct subtasks the task has. */
  readonly total: number;
  // #endregion
}
