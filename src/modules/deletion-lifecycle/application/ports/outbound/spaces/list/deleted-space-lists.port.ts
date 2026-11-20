import type { DeletedSpaceListing } from '../../../../models/deletion/deleted-space-listing.model.js';

/**
 * Interface DeletedSpaceLists
 *
 * @description
 * The deleted lists of a deleted space, owned by this module and bound to the public operation
 * `ListDeletedSpaceLists` of the spaces module.
 */
export interface DeletedSpaceLists {
  // #region Methods
  /**
   * Method deletedListsOf
   *
   * @description
   * Holds the space `FOR SHARE` until the commit, in the tenant transaction of the caller, and reads
   * whether it is still deleted and its deleted lists not erased yet, by id.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {string} spaceId - The deleted space.
   * @returns {Promise<DeletedSpaceListing>} Whether the space is still deleted, and its deleted
   * lists.
   * @throws {Error} When the read fails: the transaction rolls back.
   */
  deletedListsOf(organizationId: string, spaceId: string): Promise<DeletedSpaceListing>;
  // #endregion
}
