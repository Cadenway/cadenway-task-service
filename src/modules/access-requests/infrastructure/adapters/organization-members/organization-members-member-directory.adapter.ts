import { matchesCurrentMembership } from '../../../../../infrastructure/http/current-membership.js';
import type { FindOrganizationMember } from '../../../../organization-members/public/membership/find-organization-member.js';
import type { MemberDirectory } from '../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';

/**
 * Class OrganizationMembersMemberDirectory
 *
 * @description
 * `MemberDirectory` over the public reading `FindOrganizationMember` of the organization-members
 * module, the copy of the memberships of organization-service (decision 4 of the P3a plan: never
 * the `role` claim of the token). The reading joins the tenant transaction of the calling use case,
 * so row-level security limits it to its organization; a membership not learnt yet answers `null`,
 * as for a non-member. With `lock`, the membership stays locked `FOR SHARE` until the commit.
 */
export class OrganizationMembersMemberDirectory implements MemberDirectory {
  // #region Properties
  /**
   * Property findMember
   *
   * @description
   * The reading of the membership and role of an account.
   *
   * @type {FindOrganizationMember}
   * @readonly
   */
  private readonly findMember: FindOrganizationMember;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public reading of the organization-members module.
   *
   * @param {FindOrganizationMember} findMember - The reading of a membership.
   * @constructor
   */
  public constructor(findMember: FindOrganizationMember) {
    this.findMember = findMember;
  }
  // #endregion

  // #region Methods
  /**
   * Method roleOf
   *
   * @description
   * The role of a current member of the organization, from its active membership.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {boolean} [lock] - `true` to keep the membership locked `FOR SHARE` until the commit.
   * @returns {Promise<MemberRole | null>} Its role, or `null` when the copy holds no active
   * membership of the account.
   */
  public async roleOf(
    organizationId: string,
    userId: string,
    lock = false,
  ): Promise<MemberRole | null> {
    const member = await this.findMember.stamp({
      organizationId,
      userId,
      lock,
    });
    return member === null || !matchesCurrentMembership(organizationId, userId, member)
      ? null
      : member.role;
  }
  // #endregion
}
