import type { ListSummary, TaskCounts } from '@cadenway/contracts/types/internal/task-service';

import type { ListSummaryView } from '../../../../application/projections/count/list-summary.projection.js';
import type { TaskCountsView } from '../../../../application/projections/count/task-counts.projection.js';
import { toPlacedList } from '../placement/placed-list.mapper.js';

/**
 * Function toTaskCounts
 *
 * @description
 * Maps the counters of a list to the `TaskCounts` of the contract: the top-level tasks only, all,
 * open (not closed), done, cancelled and late (open and due before the `today` of the request).
 *
 * @param {TaskCountsView} counts - The counters.
 * @returns {TaskCounts} The counters of the contract.
 */
export function toTaskCounts(counts: TaskCountsView): TaskCounts {
  return {
    total: counts.total,
    open: counts.open,
    done: counts.done,
    cancelled: counts.cancelled,
    late: counts.late,
  };
}

/**
 * Function toListSummary
 *
 * @description
 * Maps a list and its counters to the `ListSummary` of the contract. It carries no `ETag`: the
 * contract declares none on the routes that answer it.
 *
 * @param {ListSummaryView} view - The list, as the spaces module showed it to the viewer, with
 * its counters.
 * @returns {ListSummary} The summary of the contract.
 */
export function toListSummary(view: ListSummaryView): ListSummary {
  return { list: toPlacedList(view.list), counts: toTaskCounts(view.counts) };
}
