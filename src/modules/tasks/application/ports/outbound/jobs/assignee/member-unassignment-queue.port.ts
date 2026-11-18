/**
 * Interface MemberUnassignmentQueue
 *
 * @description
 * The durable job that unassigns a member who left an organization from their tasks, enqueued in
 * the transaction of the unit of work: the job exists if and only if the transaction commits.
 */
export interface MemberUnassignmentQueue {
  // #region Methods
  /**
   * Method enqueue
   *
   * @description
   * Enqueues the unassignment of one removal once: enqueuing the same membership at the same
   * version again while its first job is kept does nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account of the member who left.
   * @param {string} memberId - The membership that ended.
   * @param {number} membershipVersion - Its version after the removal.
   * @returns {Promise<boolean>} `true` when a job was enqueued, `false` for a duplicate.
   * @throws {Error} When the organization is not the one of the transaction, or the insert fails:
   * the transaction rolls back.
   */
  enqueue(
    organizationId: string,
    userId: string,
    memberId: string,
    membershipVersion: number,
  ): Promise<boolean>;
  // #endregion
}
