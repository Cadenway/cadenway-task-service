import type {
  RemoveMemberGrants,
  RemoveMemberGrantsOutput,
} from '../../../../spaces/public/access/remove-member-grants.js';
import type { GrantRemovalBatch } from '../../../application/models/clean-up/grant-removal-batch.model.js';
import type { MemberGrants } from '../../../application/ports/outbound/spaces/access/member-grants.port.js';

/**
 * Class SpacesMemberGrants
 *
 * @description
 * `MemberGrants` on the public operation `RemoveMemberGrants` of the spaces module, which opens one
 * tenant transaction per batch in the organization context of the clean-up job.
 */
export class SpacesMemberGrants implements MemberGrants {
  // #region Properties
  /**
   * Property removeMemberGrants
   *
   * @description
   * One batch of the removal of the grants of a former member.
   *
   * @type {RemoveMemberGrants}
   * @readonly
   */
  private readonly removeMemberGrants: RemoveMemberGrants;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the spaces module.
   *
   * @param {RemoveMemberGrants} removeMemberGrants - One batch of the removal.
   * @constructor
   */
  public constructor(removeMemberGrants: RemoveMemberGrants) {
    this.removeMemberGrants = removeMemberGrants;
  }
  // #endregion

  // #region Methods
  /**
   * Method removeBatch
   *
   * @description
   * Runs one batch of `RemoveMemberGrants` for the former member.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {string} userId - The account of the member who left.
   * @returns {Promise<GrantRemovalBatch>} What the batch did.
   */
  public async removeBatch(organizationId: string, userId: string): Promise<GrantRemovalBatch> {
    const outcome: RemoveMemberGrantsOutput = await this.removeMemberGrants.execute({
      organizationId,
      userId,
    });
    return outcome.outcome === 'removed'
      ? { outcome: 'removed', removed: outcome.removed }
      : { outcome: outcome.outcome };
  }
  // #endregion
}
