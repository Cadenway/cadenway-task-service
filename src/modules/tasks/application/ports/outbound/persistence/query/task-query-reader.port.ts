import type { ListedTask } from '../../../../models/query/listed-task.model.js';
import type { MilestonePosition } from '../../../../models/query/milestone-position.model.js';
import type { TaskFilter } from '../../../../models/query/task-filter.model.js';
import type { TaskGrouping } from '../../../../models/query/task-grouping.model.js';
import type { TaskOrder } from '../../../../models/query/task-order.model.js';
import type { TaskPosition } from '../../../../models/query/task-position.model.js';
import type { TaskGroupCountsView } from '../../../../projections/query/task-group-counts.projection.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';

/**
 * Interface TaskQueryReader
 *
 * @description
 * The filtered reads of the tasks of one list, without a lock. The list is already known to be seen
 * by the actor. Every method filters on the organization and on the list, and applies the same
 * filter to the page, the total and the groups, so that the three agree. Rows are summarized in
 * batches (one query per collection for any number of tasks).
 */
export interface TaskQueryReader {
  // #region Methods
  /** Reads live milestones in the supplied visible lists by due date ascending, undated last, then ID. */
  milestones(
    organizationId: string,
    listIds: readonly string[],
    after: MilestonePosition | null,
    limit: number,
  ): Promise<readonly TaskSummaryView[]>;

  /** Counts the same live milestones, independently of the cursor. */
  milestoneTotal(organizationId: string, listIds: readonly string[]): Promise<number>;

  /**
   * Method pageOfList
   *
   * @description
   * Reads a page of the tasks of a list that match a filter, in an order, with their assignees,
   * labels and counts. Ties follow the order of creation with the id as tie-breaker; a task without
   * a due date is last in the orders by due date, ascending or not.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @param {TaskOrder} order - The order of the page.
   * @param {TaskPosition | null} after - The last task of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedTask[]>} The tasks, each with the position after it.
   */
  pageOfList(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
    order: TaskOrder,
    after: TaskPosition | null,
    limit: number,
  ): Promise<readonly ListedTask[]>;

  /**
   * Method countOfList
   *
   * @description
   * Counts the tasks of a list that match a filter.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @returns {Promise<number>} The count.
   */
  countOfList(organizationId: string, listId: string, filter: TaskFilter): Promise<number>;

  /**
   * Method groupsOfList
   *
   * @description
   * Counts the tasks of a list that match a filter by status, priority or assignee, with the
   * number of tasks that match, each counted once. The groups without a task may be left out; the
   * application fills in the zeros and orders the groups. A task with two assignees counts in both
   * of their groups and once in the total; `none` holds the tasks nobody is assigned to.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @param {TaskGrouping} grouping - What the tasks are counted by.
   * @returns {Promise<TaskGroupCountsView>} The groups, in any order, and the total.
   */
  groupsOfList(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
    grouping: TaskGrouping,
  ): Promise<TaskGroupCountsView>;
  // #endregion
}
