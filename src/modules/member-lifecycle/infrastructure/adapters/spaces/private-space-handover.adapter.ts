import type { HandOverAwaitingSpaces } from '../../../../spaces/public/space/hand-over-awaiting-spaces.js';
import type {
  HandOverPrivateSpaces,
  HandOverPrivateSpacesOutput,
} from '../../../../spaces/public/space/hand-over-private-spaces.js';
import type { PrivateSpaceHandover } from '../../../application/ports/outbound/spaces/space/private-space-handover.port.js';

/**
 * Class SpacesPrivateSpaceHandover
 *
 * @description
 * `PrivateSpaceHandover` on the public operations `HandOverPrivateSpaces` and
 * `HandOverAwaitingSpaces` of the spaces module, which join the tenant transaction of the event.
 */
export class SpacesPrivateSpaceHandover implements PrivateSpaceHandover {
  // #region Properties
  /**
   * Property handOverPrivateSpaces
   *
   * @description
   * The handover of the private spaces of a member who left.
   *
   * @type {HandOverPrivateSpaces}
   * @readonly
   */
  private readonly handOverPrivateSpaces: HandOverPrivateSpaces;

  /**
   * Property handOverAwaitingSpaces
   *
   * @description
   * The handover of the spaces awaiting an owner.
   *
   * @type {HandOverAwaitingSpaces}
   * @readonly
   */
  private readonly handOverAwaitingSpaces: HandOverAwaitingSpaces;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the two public operations of the spaces module.
   *
   * @param {HandOverPrivateSpaces} handOverPrivateSpaces - The handover of a leaver's spaces.
   * @param {HandOverAwaitingSpaces} handOverAwaitingSpaces - The handover of the awaiting spaces.
   * @constructor
   */
  public constructor(
    handOverPrivateSpaces: HandOverPrivateSpaces,
    handOverAwaitingSpaces: HandOverAwaitingSpaces,
  ) {
    this.handOverPrivateSpaces = handOverPrivateSpaces;
    this.handOverAwaitingSpaces = handOverAwaitingSpaces;
  }
  // #endregion

  // #region Methods
  /**
   * Method handOver
   *
   * @description
   * Runs `HandOverPrivateSpaces` for the member who left.
   *
   * @param {string} organizationId - The organization of the event.
   * @param {string} formerOwnerUserId - The account of the member who left.
   * @returns {Promise<number>} How many private spaces now await an owner.
   */
  public async handOver(organizationId: string, formerOwnerUserId: string): Promise<number> {
    const outcome: HandOverPrivateSpacesOutput = await this.handOverPrivateSpaces.execute({
      organizationId,
      formerOwnerUserId,
    });
    return outcome.awaitingOwner;
  }

  /**
   * Method handOverAwaiting
   *
   * @description
   * Runs `HandOverAwaitingSpaces` for the organization.
   *
   * @param {string} organizationId - The organization of the event.
   * @returns {Promise<void>} Resolves once handed over.
   */
  public async handOverAwaiting(organizationId: string): Promise<void> {
    await this.handOverAwaitingSpaces.execute({ organizationId });
  }
  // #endregion
}
