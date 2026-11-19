import type {
  ListDeletedSpaceLists,
  ListDeletedSpaceListsOutput,
} from '../../../../spaces/public/list/list-deleted-space-lists.js';
import type { DeletedSpaceListing } from '../../../application/models/deletion/deleted-space-listing.model.js';
import type { DeletedSpaceLists } from '../../../application/ports/outbound/spaces/list/deleted-space-lists.port.js';

/**
 * Class SpacesDeletedSpaceLists
 *
 * @description
 * `DeletedSpaceLists` on the public operation `ListDeletedSpaceLists` of the spaces module, which
 * joins the tenant transaction of the job step that calls it and holds the space `FOR SHARE` until
 * its commit.
 */
export class SpacesDeletedSpaceLists implements DeletedSpaceLists {
  // #region Properties
  /**
   * Property listDeletedSpaceLists
   *
   * @description
   * The read of the deleted lists of a space.
   *
   * @type {ListDeletedSpaceLists}
   * @readonly
   */
  private readonly listDeletedSpaceLists: ListDeletedSpaceLists;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the spaces module.
   *
   * @param {ListDeletedSpaceLists} listDeletedSpaceLists - The read of the deleted lists.
   * @constructor
   */
  public constructor(listDeletedSpaceLists: ListDeletedSpaceLists) {
    this.listDeletedSpaceLists = listDeletedSpaceLists;
  }
  // #endregion

  // #region Methods
  /**
   * Method deletedListsOf
   *
   * @description
   * Runs `ListDeletedSpaceLists` for the space.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {string} spaceId - The deleted space.
   * @returns {Promise<DeletedSpaceListing>} Whether the space is still deleted, and its deleted
   * lists, by id.
   */
  public async deletedListsOf(
    organizationId: string,
    spaceId: string,
  ): Promise<DeletedSpaceListing> {
    const output: ListDeletedSpaceListsOutput = await this.listDeletedSpaceLists.execute({
      organizationId,
      spaceId,
    });
    return { spaceDeleted: output.spaceDeleted, listIds: output.listIds };
  }
  // #endregion
}
