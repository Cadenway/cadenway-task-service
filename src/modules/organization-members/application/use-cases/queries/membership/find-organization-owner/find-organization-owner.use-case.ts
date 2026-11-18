import type { Membership } from '../../../../../domain/aggregates/membership/membership.aggregate.js';
import type { MembershipRepository } from '../../../../ports/outbound/persistence/membership/membership-repository.port.js';
import type { MembershipsUnitOfWork } from '../../../../ports/outbound/transactions/membership/memberships-unit-of-work.port.js';
import type { FindOrganizationOwnerInput } from './find-organization-owner.input.js';
import type { FindOrganizationOwnerOutput } from './find-organization-owner.output.js';

/**
 * Class FindOrganizationOwner
 *
 * @description
 * The owner of an organization, from the copy of the memberships: the member organization-service
 * gave the role `owner` at the creation (`member.joined.v1` with no invitation), which the role of
 * a member never becomes nor stops being and which is never removed
 * (`asyncapi/organization-service.yaml`). Runs in the tenant transaction of the caller and joins
 * it, or opens one for the organization of the context; never from a system transaction.
 */
export class FindOrganizationOwner {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction, joined to the one of the caller.
   *
   * @type {MembershipsUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: MembershipsUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the unit of work.
   *
   * @param {MembershipsUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: MembershipsUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the active owner membership of the organization.
   *
   * @param {FindOrganizationOwnerInput} input - The organization.
   * @returns {Promise<FindOrganizationOwnerOutput | null>} The owner, or `null` while the join of the
   * owner has not reached the copy: the caller decides whether that is a failure to retry.
   */
  public async execute(
    input: FindOrganizationOwnerInput,
  ): Promise<FindOrganizationOwnerOutput | null> {
    const owner: Membership | null = await this.unitOfWork.run(
      (memberships: MembershipRepository): Promise<Membership | null> =>
        memberships.findActiveOwner(input.organizationId),
    );
    if (owner === null) {
      return null;
    }
    const { id, userId } = owner.snapshot;
    return { memberId: id, userId };
  }
  // #endregion
}
