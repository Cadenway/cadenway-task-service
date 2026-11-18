import type { PlacedList } from '../../models/placement/placed-list.model.js';
import type { ListSummaryView } from '../../projections/count/list-summary.projection.js';
import type { TaskCountsView } from '../../projections/count/task-counts.projection.js';

/**
 * Class ListSummaryBuilder
 *
 * @description
 * Pairs lists with the counts of their top-level tasks (`ListSummary`): a list the counter left out
 * has no task and gets zeros, as the contract has every count present.
 */
export class ListSummaryBuilder {
  // #region Properties
  /** The counts of a list without a task. */
  private static readonly NO_TASK: TaskCountsView = {
    total: 0,
    open: 0,
    done: 0,
    cancelled: 0,
    late: 0,
  };
  // #endregion

  // #region Methods
  /**
   * Method build
   *
   * @description
   * Summarizes lists, keeping their order.
   *
   * @param {readonly PlacedList[]} lists - The lists, in the order to answer.
   * @param {ReadonlyMap<string, TaskCountsView>} counts - The counts by list id.
   * @returns {readonly ListSummaryView[]} One summary per list.
   */
  public build(
    lists: readonly PlacedList[],
    counts: ReadonlyMap<string, TaskCountsView>,
  ): readonly ListSummaryView[] {
    return lists.map((list: PlacedList): ListSummaryView => ({
      list,
      counts: counts.get(list.id) ?? ListSummaryBuilder.NO_TASK,
    }));
  }
  // #endregion
}
