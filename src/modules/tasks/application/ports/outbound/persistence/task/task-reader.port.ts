import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { SubtaskCounts } from '../../../../projections/task/subtask-counts.projection.js';
import type { TaskReferenceView } from '../../../../projections/task/task-reference.projection.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';

/**
 * Interface TaskReader
 *
 * @description
 * The read side of the tasks: projections computed in batches (one query per collection for any
 * number of tasks, never one per task), without a lock. Every method filters on the organization.
 */
export interface TaskReader {
  // #region Methods
  /**
   * Method subtaskCounts
   *
   * @description
   * Counts the direct subtasks of tasks and the closed ones (`done`, `cancelled`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, SubtaskCounts>>} The counts by task id; a task without
   * subtask may be left out.
   */
  subtaskCounts(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubtaskCounts>>;

  /**
   * Method childrenOf
   *
   * @description
   * Reads a page of the direct subtasks of a task, in the order of their creation with the id as
   * tie-breaker, with their assignees, labels and counts.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @param {PagePosition | null} after - The last row of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly TaskSummaryView[]>} The rows.
   */
  childrenOf(
    organizationId: string,
    parentId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<readonly TaskSummaryView[]>;

  /**
   * Method countChildren
   *
   * @description
   * Counts the direct subtasks of a task.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @returns {Promise<number>} The count.
   */
  countChildren(organizationId: string, parentId: string): Promise<number>;

  /**
   * Method references
   *
   * @description
   * Reads the key, the name and the status, as they are now, of tasks.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, TaskReferenceView>>} The references by task id.
   */
  references(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskReferenceView>>;
  // #endregion
}
