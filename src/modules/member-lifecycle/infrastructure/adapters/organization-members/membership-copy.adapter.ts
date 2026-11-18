import type { ApplyMembershipChange } from '../../../../organization-members/public/membership/apply-membership-change.js';
import type { MembershipCopy } from '../../../application/ports/outbound/members/membership/membership-copy.port.js';
import type { ApplyMemberEventInput } from '../../../application/use-cases/commands/membership/apply-member-event/apply-member-event.input.js';

/**
 * Class OrganizationMembersMembershipCopy
 *
 * @description
 * `MembershipCopy` on `ApplyMembershipChange`, the public operation of the organization-members
 * module (`public/membership/apply-membership-change`). The operation joins the tenant transaction
 * of its caller, the one the deduplicator of the kit opened for the organization of the event.
 */
export class OrganizationMembersMembershipCopy implements MembershipCopy {
  // #region Properties
  /**
   * Property applyMembershipChange
   *
   * @description
   * The public operation of the organization-members module.
   *
   * @type {ApplyMembershipChange}
   * @readonly
   */
  private readonly applyMembershipChange: ApplyMembershipChange;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the operation `OrganizationMembersModule` exports.
   *
   * @param {ApplyMembershipChange} applyMembershipChange - The public operation.
   * @constructor
   */
  public constructor(applyMembershipChange: ApplyMembershipChange) {
    this.applyMembershipChange = applyMembershipChange;
  }
  // #endregion

  // #region Methods
  /**
   * Method apply
   *
   * @description
   * Applies the member event to the copy, member by member.
   *
   * @param {ApplyMemberEventInput} change - The member event.
   * @returns {Promise<void>} Resolves once applied, or at once when it changes nothing.
   * @throws {Error} What the operation throws: a membership that names another account, an invalid
   * version or a failure of PostgreSQL.
   */
  public async apply(change: ApplyMemberEventInput): Promise<void> {
    await this.applyMembershipChange.execute({
      kind: change.kind,
      memberId: change.memberId,
      organizationId: change.organizationId,
      userId: change.userId,
      role: change.role,
      version: change.version,
      occurredAt: change.occurredAt,
    });
  }
  // #endregion
}
