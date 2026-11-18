/**
 * Interface PrivateSpaceHandover
 *
 * @description
 * The hand-over of the private spaces of a member who left the organization to its owner, which
 * the spaces module owns ("Members" of `openapi/internal/task-service.yaml`). Called inside the
 * tenant transaction the deduplicator of the kit opened for the organization of the event, which
 * it joins: the spaces it changes and their `space.updated.v1` outbox rows commit with the copy
 * of the memberships and the processed event id.
 */
export interface PrivateSpaceHandover {
  // #region Methods
  /**
   * Method handOver
   *
   * @description
   * Gives every private space the former member owns to the owner of the organization. Repeating
   * it changes nothing: the former member owns none of them any more.
   *
   * @param {string} organizationId - The organization of the event and of its tenant transaction.
   * @param {string} formerOwnerUserId - The account of the member who left.
   * @returns {Promise<void>} Resolves once the spaces are handed over, or at once when there is none.
   * @throws {Error} When the hand-over fails: the transaction rolls back and the kit redelivers the
   * event.
   */
  handOver(organizationId: string, formerOwnerUserId: string): Promise<void>;
  // #endregion
}
