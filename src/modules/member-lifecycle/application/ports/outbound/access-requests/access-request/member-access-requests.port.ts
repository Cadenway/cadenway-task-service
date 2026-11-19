import type { RequestDropBatch } from '../../../../models/clean-up/request-drop-batch.model.js';

/**
 * Interface MemberAccessRequests
 *
 * @description
 * What the clean-up after a member removal does to the access requests of the access-requests
 * module, owned by this module and bound to the public operation `DropMemberAccessRequests`.
 */
export interface MemberAccessRequests {
  // #region Methods
  /**
   * Method dropBatch
   *
   * @description
   * Drops one batch of the access requests of a former member, pending or answered (the answered
   * ones carry the message they wrote), and their attempts, in its
   * own tenant transaction of the organization of the context, without event. Nothing changes
   * while the copy holds the account as a member again. A dropped request is not taken again, so
   * the job asks until `none-left`.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {string} userId - The account of the member who left.
   * @returns {Promise<RequestDropBatch>} What the batch did.
   * @throws {Error} When the batch fails: it rolls back alone.
   */
  dropBatch(organizationId: string, userId: string): Promise<RequestDropBatch>;
  // #endregion
}
