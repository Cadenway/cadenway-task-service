import type { ListedTask } from '../../../../models/query/listed-task.model.js';
import type { TaskPosition } from '../../../../models/query/task-position.model.js';
import type { MyTaskState } from '../../../../models/user/my-task-state.model.js';

/**
 * Interface AssignedTaskReader
 *
 * @description
 * The tasks assigned to an account, without a lock. Every method filters on the organization.
 */
export interface AssignedTaskReader {
  // #region Methods
  /**
   * Method pageAssignedTo
   *
   * @description
   * Reads a page of the tasks assigned to an account in some lists, subtasks included, with their
   * assignees, labels and counts: by due date with the tasks without one last, then in the order of
   * their creation with the id as tie-breaker. The position of a task holds its due date (or
   * `null`) as `sortValue`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @param {MyTaskState} state - `open` for the tasks not closed, `closed` for `done` and `cancelled`.
   * @param {TaskPosition | null} after - The last task of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedTask[]>} The tasks, each with the position after it.
   */
  pageAssignedTo(
    organizationId: string,
    userId: string,
    listIds: readonly string[],
    state: MyTaskState,
    after: TaskPosition | null,
    limit: number,
  ): Promise<readonly ListedTask[]>;
  // #endregion
}
