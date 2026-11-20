import type { RequestDropTarget } from '../../../../models/access-request/request-drop-target.model.js';

/**
 * Interface TargetAccessRequests
 *
 * @description
 * The pending access requests of what was deleted, owned by this module and bound to the public
 * operation `DropTargetAccessRequests` of the access-requests module.
 */
export interface TargetAccessRequests {
  // #region Methods
  /**
   * Method dropPending
   *
   * @description
   * Deletes the pending requests of the target in the tenant transaction of the caller, which it
   * joins, without event; the answered ones stay.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {RequestDropTarget} target - The tasks moved to the trash (any number), the deleted list
   * or the deleted space.
   * @returns {Promise<number>} How many requests were deleted.
   * @throws {Error} When the statement fails: the transaction rolls back.
   */
  dropPending(organizationId: string, target: RequestDropTarget): Promise<number>;
  // #endregion
}
