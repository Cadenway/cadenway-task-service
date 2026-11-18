import type { TaskUnassignmentBatch } from '../../../../models/clean-up/task-unassignment-batch.model.js';

/**
 * Interface TaskAssignments
 *
 * @description
 * What the clean-up after a member removal does to the tasks of the tasks module, owned by this
 * module and bound to the public operation of tasks.
 */
export interface TaskAssignments {
  // #region Methods
  /**
   * Method unassignBatch
   *
   * @description
   * Removes a former member from one batch of the tasks they are assigned to, closed ones
   * included, in its own tenant transaction of the organization of the context, after
   * `afterTaskId`. Nothing changes while the copy holds the account as a member again.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {string} userId - The account of the member who left.
   * @param {string | null} afterTaskId - The last task id of the previous batch of the attempt,
   * `null` for the first.
   * @returns {Promise<TaskUnassignmentBatch>} What the batch did.
   * @throws {Error} When the batch fails: it rolls back alone.
   */
  unassignBatch(
    organizationId: string,
    userId: string,
    afterTaskId: string | null,
  ): Promise<TaskUnassignmentBatch>;
  // #endregion
}
