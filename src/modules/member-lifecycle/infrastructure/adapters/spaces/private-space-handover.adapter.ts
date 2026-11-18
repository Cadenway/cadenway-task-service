import type { HandOverAwaitingSpaces } from '../../../../spaces/public/space/hand-over-awaiting-spaces.js';
import type {
  HandOverPrivateSpaces,
  HandOverPrivateSpacesOutput,
} from '../../../../spaces/public/space/hand-over-private-spaces.js';
import type { SpaceHandoverBatch } from '../../../application/models/clean-up/space-handover-batch.model.js';
import type { PrivateSpaceHandover } from '../../../application/ports/outbound/spaces/space/private-space-handover.port.js';

/**
 * Class SpacesPrivateSpaceHandover
 *
 * @description
 * `PrivateSpaceHandover` on the public operations `HandOverPrivateSpaces` and
 * `HandOverAwaitingSpaces` of the spaces module: the first opens one tenant transaction per batch
 * in the organization context of the clean-up job, the second joins the transaction of the event.
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
   * Method handOverBatch
   *
   * @description
   * Runs one batch of `HandOverPrivateSpaces` for the member who left.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {string} formerOwnerUserId - The account of the member who left.
   * @returns {Promise<SpaceHandoverBatch>} What the batch did.
   */
  public async handOverBatch(
    organizationId: string,
    formerOwnerUserId: string,
  ): Promise<SpaceHandoverBatch> {
    const outcome: HandOverPrivateSpacesOutput = await this.handOverPrivateSpaces.execute({
      organizationId,
      formerOwnerUserId,
    });
    return outcome;
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
