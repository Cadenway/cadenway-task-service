import type {
  FindOrganizationMember,
  FindOrganizationMemberOutput,
} from '../../../../organization-members/public/membership/find-organization-member.js';
import type {
  FindOrganizationOwner,
  FindOrganizationOwnerOutput,
} from '../../../../organization-members/public/membership/find-organization-owner.js';
import type { MemberDirectory } from '../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';

/**
 * Class OrganizationMembersMemberDirectory
 *
 * @description
 * `MemberDirectory` over the public readings of the organization-members module, the copy of the
 * memberships of organization-service (decision 4 of the P3a plan). Both readings join the tenant
 * transaction of the calling use case, so row-level security limits them to its organization; a
 * membership not learnt yet answers `null`, as for a non-member.
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

  /**
   * Property findOwner
   *
   * @description
   * The reading of the owner of an organization.
   *
   * @type {FindOrganizationOwner}
   * @readonly
   */
  private readonly findOwner: FindOrganizationOwner;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the two public readings of the organization-members module.
   *
   * @param {FindOrganizationMember} findMember - The reading of a membership.
   * @param {FindOrganizationOwner} findOwner - The reading of the owner.
   * @constructor
   */
  public constructor(findMember: FindOrganizationMember, findOwner: FindOrganizationOwner) {
    this.findMember = findMember;
    this.findOwner = findOwner;
  }
  // #endregion

  // #region Methods
  /**
   * Finds the unique active membership for a new resource grant.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account receiving the grant.
   * @param {boolean} [lock] - Keeps the membership locked through the write.
   * @returns {Promise<FindOrganizationMemberOutput | null>} The grant's membership generation.
   */
  public grantMembershipOf(
    organizationId: string,
    userId: string,
    lock = false,
  ): Promise<FindOrganizationMemberOutput | null> {
    return this.findMember.execute({ organizationId, userId, lock, unique: true });
  }

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
    const member: FindOrganizationMemberOutput | null = await this.findMember.execute({
      organizationId,
      userId,
      lock,
    });
    return member === null ? null : member.role;
  }

  /**
   * Method ownerOf
   *
   * @description
   * The account that owns the organization, from its active owner membership.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @returns {Promise<string | null>} Its account, or `null` while the copy has not learnt it.
   */
  public async ownerOf(organizationId: string): Promise<string | null> {
    const owner: FindOrganizationOwnerOutput | null = await this.findOwner.execute({
      organizationId,
    });
    return owner === null ? null : owner.userId;
  }
  // #endregion
}
