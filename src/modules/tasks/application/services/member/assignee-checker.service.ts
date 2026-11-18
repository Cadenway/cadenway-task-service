import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';

/**
 * Class AssigneeChecker
 *
 * @description
 * Reads the role of the people about to be assigned, from the copy of the memberships, and locks
 * their memberships `FOR SHARE` in ascending id order, so that a concurrent removal of one of them
 * waits for the write and two writers never lock them in opposite orders. Whether a role may be
 * assigned is the rule of the domain (`Task.create`, `Task.assign`): this class only reads.
 */
export class AssigneeChecker {
  // #region Properties
  /** The copy of the memberships. */
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
   * Method candidates
   *
   * @description
   * Reads the role of each account, once per distinct account.
   *
   * @param {string} organizationId - The organization of the request context.
   * @param {readonly string[]} userIds - The accounts, in the order the request gave them.
   * @param {boolean} lock - `true` in a write: the memberships stay locked until the commit.
   * @returns {Promise<readonly AssigneeCandidate[]>} One candidate per given account, in the given
   * order, with `null` as role for an account the copy does not hold as a member.
   */
  public async candidates(
    organizationId: string,
    userIds: readonly string[],
    lock: boolean,
  ): Promise<readonly AssigneeCandidate[]> {
    const roles: Map<string, MemberRole | null> = new Map<string, MemberRole | null>();
    for (const userId of [...new Set<string>(userIds)].sort()) {
      roles.set(userId, await this.members.roleOf(organizationId, userId, lock));
    }
    return userIds.map((userId: string): AssigneeCandidate => ({
      userId,
      role: roles.get(userId) ?? null,
    }));
  }
  // #endregion
}
