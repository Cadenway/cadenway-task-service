import type { TaskReference } from '../../../../models/task/task-reference.model.js';

/**
 * Interface TaskReferences
 *
 * @description
 * What the access-requests module asks the tasks module about the tasks requests name, whatever
 * the member sees: this module decides what it tells. Every call joins the tenant transaction of
 * the use case and only reads.
 */
export interface TaskReferences {
  // #region Methods
  /**
   * Method findByKey
   *
   * @description
   * Reads a task by its key.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskKey - The key as received.
   * @returns {Promise<TaskReference | null>} The task, or `null` when the organization has no task
   * with this key.
   */
  findByKey(organizationId: string, taskKey: string): Promise<TaskReference | null>;

  /**
   * Method findByIds
   *
   * @description
   * Reads tasks by their ids, in one batch.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The ids, at most 100.
   * @returns {Promise<readonly TaskReference[]>} The tasks found, in no particular order.
   */
  findByIds(organizationId: string, taskIds: readonly string[]): Promise<readonly TaskReference[]>;
  // #endregion
}
