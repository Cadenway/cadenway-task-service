import type { HandOverPrivateSpaces } from '../../../../spaces/public/space/hand-over-private-spaces.js';
import type { PrivateSpaceHandover } from '../../../application/ports/outbound/spaces/space/private-space-handover.port.js';

/**
 * Class SpacesPrivateSpaceHandover
 *
 * @description
 * `PrivateSpaceHandover` on `HandOverPrivateSpaces`, the public operation of the spaces module
 * (`public/space/hand-over-private-spaces`). The operation joins the tenant transaction of its
 * caller, the one the deduplicator of the kit opened for the organization of the event, and
 * appends its `space.updated.v1` to the outbox there.
 */
export class SpacesPrivateSpaceHandover implements PrivateSpaceHandover {
  // #region Properties
  /**
   * Property handOverPrivateSpaces
   *
   * @description
   * The public operation of the spaces module.
   *
   * @type {HandOverPrivateSpaces}
   * @readonly
   */
  private readonly handOverPrivateSpaces: HandOverPrivateSpaces;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the operation `SpacesModule` exports.
   *
   * @param {HandOverPrivateSpaces} handOverPrivateSpaces - The public operation.
   * @constructor
   */
  public constructor(handOverPrivateSpaces: HandOverPrivateSpaces) {
    this.handOverPrivateSpaces = handOverPrivateSpaces;
  }
  // #endregion

  // #region Methods
  /**
   * Method handOver
   *
   * @description
   * Hands the private spaces of the former member over to the owner of the organization.
   *
   * @param {string} organizationId - The organization of the event and of its tenant transaction.
   * @param {string} formerOwnerUserId - The account of the member who left.
   * @returns {Promise<void>} Resolves once handed over, or at once when there is nothing to hand.
   * @throws {Error} What the operation throws.
   */
  public async handOver(organizationId: string, formerOwnerUserId: string): Promise<void> {
    await this.handOverPrivateSpaces.execute({ organizationId, formerOwnerUserId });
  }
  // #endregion
}
