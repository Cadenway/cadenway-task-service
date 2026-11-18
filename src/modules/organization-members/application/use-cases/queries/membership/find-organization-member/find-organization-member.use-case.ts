import type { Membership } from '../../../../../domain/aggregates/membership/membership.aggregate.js';
import { leastPrivilegedMembership } from '../../../../../domain/policies/membership/least-privileged-membership.policy.js';
import type { MembershipRepository } from '../../../../ports/outbound/persistence/membership/membership-repository.port.js';
import type { MembershipsUnitOfWork } from '../../../../ports/outbound/transactions/membership/memberships-unit-of-work.port.js';
import type { FindOrganizationMemberInput } from './find-organization-member.input.js';
import type { FindOrganizationMemberOutput } from './find-organization-member.output.js';

/**
 * Class FindOrganizationMember
 *
 * @description
 * Whether an account is a current member of an organization, and with which role, from the copy of
 * the memberships (decision 4 of the P3a plan: never from the `role` claim of the internal token).
 * Runs in the tenant transaction of the caller and joins it, or opens one for the organization of
 * the context; it must not be called from a system transaction, which the kit refuses to turn into
 * a tenant one. A membership organization-service created a few seconds ago may not be in the copy
 * yet: the caller answers as for a non-member. When the copy holds two active memberships of the
 * account (a removal not applied yet after the person joined again), the least privileged one
 * answers (`leastPrivilegedMembership`).
 */
export class FindOrganizationMember {
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
   * Reads the active memberships of the account in the organization and keeps the one that answers.
   *
   * @param {FindOrganizationMemberInput} input - The organization and the account.
   * @returns {Promise<FindOrganizationMemberOutput | null>} Its id and role, or `null` when the copy
   * holds no active membership of the account in that organization.
   */
  public async execute(
    input: FindOrganizationMemberInput,
  ): Promise<FindOrganizationMemberOutput | null> {
    const active: Membership[] = await this.unitOfWork.run(
      (memberships: MembershipRepository): Promise<Membership[]> =>
        memberships.listActiveByUser(input.organizationId, input.userId, input.lock === true),
    );
    const membership: Membership | null = leastPrivilegedMembership(active);
    if (membership === null) {
      return null;
    }
    const { id, role } = membership.snapshot;
    return { memberId: id, role };
  }
  // #endregion
}
