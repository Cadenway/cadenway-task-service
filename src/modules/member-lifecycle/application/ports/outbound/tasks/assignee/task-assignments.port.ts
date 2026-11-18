/**
 * Interface TaskAssignments
 *
 * @description
 * What a member removal does to the tasks of the tasks module, owned by this module and bound to
 * the public operation of tasks. It joins the tenant transaction of the event, so the unassignments,
 * their activity entries and their `task.updated.v1` events commit with the copy of the
 * memberships and the hand-over of the private spaces, or none does.
 */
export interface TaskAssignments {
  // #region Methods
  /**
   * Method unassignRemovedMember
   *
   * @description
   * Removes a former member from every task they are assigned to, closed ones included. Does
   * nothing while the copy still holds the account as a member under another membership.
   *
   * @param {string} organizationId - The organization of the event.
   * @param {string} userId - The account of the member who left.
   * @returns {Promise<number>} How many tasks the account was removed from, 0 when none.
   */
  unassignRemovedMember(organizationId: string, userId: string): Promise<number>;
  // #endregion
}
