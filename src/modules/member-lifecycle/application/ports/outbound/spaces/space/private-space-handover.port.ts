import type { SpaceHandoverBatch } from '../../../../models/clean-up/space-handover-batch.model.js';

/**
 * Interface PrivateSpaceHandover
 *
 * @description
 * What the member lifecycle does to the private spaces of the spaces module, owned by this module
 * and bound to the public operations of spaces.
 */
export interface PrivateSpaceHandover {
  // #region Methods
  /**
   * Method handOverBatch
   *
   * @description
   * Hands one batch of the private spaces of a member who left over to the owner of the
   * organization, in its own tenant transaction of the organization of the context; while the copy
   * does not hold that owner, leaves them awaiting one, seen by nobody. A space handed over or
   * awaiting is not taken again, so the clean-up job asks again until `none-left`.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {string} formerOwnerUserId - The account of the member who left.
   * @returns {Promise<SpaceHandoverBatch>} What the batch did.
   * @throws {Error} When the batch fails: it rolls back alone.
   */
  handOverBatch(organizationId: string, formerOwnerUserId: string): Promise<SpaceHandoverBatch>;

  /**
   * Method handOverAwaiting
   *
   * @description
   * Gives the owner of the organization, now in the copy, every space that awaits an owner, in the
   * tenant transaction of the event, which it joins.
   *
   * @param {string} organizationId - The organization of the event.
   * @returns {Promise<void>} Resolves once handed over, or at once when nothing awaits.
   */
  handOverAwaiting(organizationId: string): Promise<void>;
  // #endregion
}
