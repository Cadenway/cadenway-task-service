import type { DeletedSpacePurge } from '../../../../models/deletion/deleted-space-purge.model.js';

/**
 * Interface DeletedSpaceEraser
 *
 * @description
 * The erasure of a deleted space left without a list, owned by this module and bound to the public
 * operation `PurgeDeletedSpace` of the spaces module.
 */
export interface DeletedSpaceEraser {
  // #region Methods
  /**
   * Method erase
   *
   * @description
   * Locks the space and, when it is deleted and no list row of it is left, erases its grants and
   * its row (its prefixes stay reserved), in the tenant transaction of the caller, without event.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {string} spaceId - The deleted space.
   * @returns {Promise<DeletedSpacePurge>} What the erasure did.
   * @throws {Error} When the erasure fails: the transaction rolls back.
   */
  erase(organizationId: string, spaceId: string): Promise<DeletedSpacePurge>;
  // #endregion
}
