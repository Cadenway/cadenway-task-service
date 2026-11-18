/**
 * Interface PrivateSpaceHandover
 *
 * @description
 * What a member event does to the private spaces of the spaces module, owned by this module and
 * bound to the public operations of spaces. Both join the tenant transaction of the event.
 */
export interface PrivateSpaceHandover {
  // #region Methods
  /**
   * Method handOver
   *
   * @description
   * Hands the private spaces of a member who left over to the owner of the organization; when the
   * copy does not hold that owner yet, leaves them awaiting one, seen by nobody.
   *
   * @param {string} organizationId - The organization of the event.
   * @param {string} formerOwnerUserId - The account of the member who left.
   * @returns {Promise<number>} How many private spaces now await an owner, 0 when none.
   */
  handOver(organizationId: string, formerOwnerUserId: string): Promise<number>;

  /**
   * Method handOverAwaiting
   *
   * @description
   * Gives the owner of the organization, now in the copy, every space that awaits an owner.
   *
   * @param {string} organizationId - The organization of the event.
   * @returns {Promise<void>} Resolves once handed over, or at once when nothing awaits.
   */
  handOverAwaiting(organizationId: string): Promise<void>;
  // #endregion
}
