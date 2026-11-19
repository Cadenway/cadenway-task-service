import type {
  PurgeDeletedSpace,
  PurgeDeletedSpaceOutput,
} from '../../../../spaces/public/space/purge-deleted-space.js';
import type { DeletedSpacePurge } from '../../../application/models/deletion/deleted-space-purge.model.js';
import type { DeletedSpaceEraser } from '../../../application/ports/outbound/spaces/space/deleted-space-eraser.port.js';

/**
 * Class SpacesDeletedSpaceEraser
 *
 * @description
 * `DeletedSpaceEraser` on the public operation `PurgeDeletedSpace` of the spaces module, which
 * joins the tenant transaction of the job step that calls it.
 */
export class SpacesDeletedSpaceEraser implements DeletedSpaceEraser {
  // #region Properties
  /**
   * Property purgeDeletedSpace
   *
   * @description
   * The erasure of a deleted space left without a list.
   *
   * @type {PurgeDeletedSpace}
   * @readonly
   */
  private readonly purgeDeletedSpace: PurgeDeletedSpace;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the spaces module.
   *
   * @param {PurgeDeletedSpace} purgeDeletedSpace - The erasure of a deleted space.
   * @constructor
   */
  public constructor(purgeDeletedSpace: PurgeDeletedSpace) {
    this.purgeDeletedSpace = purgeDeletedSpace;
  }
  // #endregion

  // #region Methods
  /**
   * Method erase
   *
   * @description
   * Runs `PurgeDeletedSpace` for the space.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {string} spaceId - The deleted space.
   * @returns {Promise<DeletedSpacePurge>} What the erasure did.
   */
  public async erase(organizationId: string, spaceId: string): Promise<DeletedSpacePurge> {
    const output: PurgeDeletedSpaceOutput = await this.purgeDeletedSpace.execute({
      organizationId,
      spaceId,
    });
    return output.outcome;
  }
  // #endregion
}
