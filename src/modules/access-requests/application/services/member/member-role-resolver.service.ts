import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';
import { AccessRequestRefusal } from '../../models/access-request/access-request-refusal.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';

/**
 * Class MemberRoleResolver
 *
 * @description
 * Resolves the role of the actor in the organization from the copy of the memberships (decision 4
 * of the P3a plan), never from the `role` claim of the internal token. An account the copy does not
 * hold as a current member answers `404 organization.not-found` (`openapi/internal/task-service.yaml`).
 * Call it inside the unit of work: the directory joins the tenant transaction.
 */
export class MemberRoleResolver {
  // #region Properties
  /**
   * Property members
   *
   * @description
   * The copy of the memberships.
   *
   * @type {MemberDirectory}
   * @readonly
   */
  private readonly members: MemberDirectory;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the directory of the members.
   *
   * @param {MemberDirectory} members - The copy of the memberships.
   * @constructor
   */
  public constructor(members: MemberDirectory) {
    this.members = members;
  }
  // #endregion

  // #region Methods
  /**
   * Method resolve
   *
   * @description
   * Finds the role of the acting account.
   *
   * @param {string} organizationId - The organization of the request context.
   * @param {string} userId - The acting account.
   * @param {boolean} [lock] - `true` in a write: the membership stays locked `FOR SHARE` until the
   * commit, so that a concurrent removal waits for the write and its clean-up job sees what it
   * stored.
   * @returns {Promise<MemberRole>} Its role.
   * @throws {AccessRequestRefusal} `organization-not-found` when the account is not a current
   * member.
   */
  public async resolve(organizationId: string, userId: string, lock = false): Promise<MemberRole> {
    const role: MemberRole | null = await this.members.roleOf(organizationId, userId, lock);
    if (role === null) {
      throw new AccessRequestRefusal({ reason: 'organization-not-found' });
    }
    return role;
  }
  // #endregion
}
