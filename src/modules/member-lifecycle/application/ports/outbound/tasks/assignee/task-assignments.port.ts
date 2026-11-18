/**
 * Interface TaskAssignments
 *
 * @description
 * What a member removal does to the tasks of the tasks module, owned by this module and bound to
 * the public operation of tasks. It joins the tenant transaction of the event, so the job that
 * unassigns the former member commits with the copy of the memberships and the hand-over of the
 * private spaces, or none does. The removal itself touches no task.
 */
export interface TaskAssignments {
  // #region Methods
  /**
   * Method scheduleUnassignment
   *
   * @description
   * Enqueues the job that removes a former member from every task they are assigned to, closed
   * ones included, once per removal: the same membership at the same version enqueues nothing
   * more. The job stops without unassigning while the copy holds the account as a member again.
   *
   * @param {string} organizationId - The organization of the event.
   * @param {string} userId - The account of the member who left.
   * @param {string} memberId - The membership that ended.
   * @param {number} membershipVersion - Its version after the removal.
   * @returns {Promise<boolean>} `true` when a job was enqueued, `false` for a duplicate.
   */
  scheduleUnassignment(
    organizationId: string,
    userId: string,
    memberId: string,
    membershipVersion: number,
  ): Promise<boolean>;
  // #endregion
}
