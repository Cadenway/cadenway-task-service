import type { PlacedList } from '../../models/placement/placed-list.model.js';
import type { TaskCountsView } from './task-counts.projection.js';

/**
 * Interface ListSummaryView
 *
 * @description
 * A list with the counts of its top-level tasks (`ListSummary` of the contract).
 */
export interface ListSummaryView {
  // #region Properties
  /** The list, as the spaces module answers it. */
  readonly list: PlacedList;

  /** The counts of its top-level tasks; zeros for a list without a task. */
  readonly counts: TaskCountsView;
  // #endregion
}
