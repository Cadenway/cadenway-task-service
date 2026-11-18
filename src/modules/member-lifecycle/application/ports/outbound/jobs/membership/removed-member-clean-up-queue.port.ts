/**
 * Interface RemovedMemberCleanUpQueue
 *
 * @description
 * The durable job that cleans up after a member who left an organization (their private spaces,
 * then their assignments), enqueued in the tenant transaction of the removal: the job exists if
 * and only if the transaction commits, and runs in the organization of that transaction.
 */
export interface RemovedMemberCleanUpQueue {
  // #region Methods
  /**
   * Method enqueue
   *
   * @description
   * Enqueues the clean-up of one removal once: enqueuing the same membership at the same version
   * again while its first job is kept does nothing. The organization is the one of the
   * transaction; it is not a parameter, so it cannot differ from it.
   *
   * @param {string} userId - The account of the member who left.
   * @param {string} memberId - The membership that ended.
   * @param {number} membershipVersion - Its version after the removal.
   * @returns {Promise<boolean>} `true` when a job was enqueued, `false` for a duplicate.
   * @throws {Error} When the insert fails: the transaction rolls back.
   */
  enqueue(userId: string, memberId: string, membershipVersion: number): Promise<boolean>;
  // #endregion
}
