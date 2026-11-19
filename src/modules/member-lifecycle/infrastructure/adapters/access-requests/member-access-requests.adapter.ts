import type {
  DropMemberAccessRequests,
  DropMemberAccessRequestsOutput,
} from '../../../../access-requests/public/access-request/drop-member-access-requests.js';
import type { RequestDropBatch } from '../../../application/models/clean-up/request-drop-batch.model.js';
import type { MemberAccessRequests } from '../../../application/ports/outbound/access-requests/access-request/member-access-requests.port.js';

/**
 * Class AccessRequestsMemberAccessRequests
 *
 * @description
 * `MemberAccessRequests` on the public operation `DropMemberAccessRequests` of the access-requests
 * module, which opens one tenant transaction per batch in the organization context of the clean-up
 * job.
 */
export class AccessRequestsMemberAccessRequests implements MemberAccessRequests {
  // #region Properties
  /**
   * Property dropMemberAccessRequests
   *
   * @description
   * One batch of the dropping of the requests of a former member, pending or answered.
   *
   * @type {DropMemberAccessRequests}
   * @readonly
   */
  private readonly dropMemberAccessRequests: DropMemberAccessRequests;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the access-requests module.
   *
   * @param {DropMemberAccessRequests} dropMemberAccessRequests - One batch of the dropping.
   * @constructor
   */
  public constructor(dropMemberAccessRequests: DropMemberAccessRequests) {
    this.dropMemberAccessRequests = dropMemberAccessRequests;
  }
  // #endregion

  // #region Methods
  /**
   * Method dropBatch
   *
   * @description
   * Runs one batch of `DropMemberAccessRequests` for the former member.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {string} userId - The account of the member who left.
   * @returns {Promise<RequestDropBatch>} What the batch did.
   */
  public async dropBatch(organizationId: string, userId: string): Promise<RequestDropBatch> {
    const outcome: DropMemberAccessRequestsOutput = await this.dropMemberAccessRequests.execute({
      organizationId,
      userId,
    });
    return outcome.outcome === 'dropped'
      ? { outcome: 'dropped', dropped: outcome.dropped }
      : { outcome: outcome.outcome };
  }
  // #endregion
}
