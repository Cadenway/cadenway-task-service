/**
 * Interface TrashPurgeQueue
 *
 * @description
 * The `task.purge-trash` jobs the daily schedule enqueues, one per organization with something to
 * erase, bound to the system transaction of a `TrashPurgeScheduleUnitOfWork` run: a job exists if
 * and only if that transaction commits.
 */
export interface TrashPurgeQueue {
  // #region Methods
  /**
   * Method enqueue
   *
   * @description
   * Enqueues the purge of one organization, in the envelope of that organization (so its worker runs
   * in it), under the occurrence key of the schedule: enqueuing the same organization under the same
   * key again while its job is kept does nothing.
   *
   * @param {string} organizationId - The organization, in lower case.
   * @param {string} occurrenceKey - The occurrence of the schedule, the same for every organization.
   * @returns {Promise<boolean>} `true` when a job was enqueued, `false` for a duplicate.
   * @throws {Error} When the insert fails: the transaction rolls back.
   */
  enqueue(organizationId: string, occurrenceKey: string): Promise<boolean>;
  // #endregion
}
