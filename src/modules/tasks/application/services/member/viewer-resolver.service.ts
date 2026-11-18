import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';

/**
 * Class ViewerResolver
 *
 * @description
 * Resolves who acts: the role of the account in the organization comes from the copy of the
 * memberships (decision 4 of the P3a plan), never from the `role` claim of the internal token. An
 * account the copy does not hold as a current member is answered as `404 organization.not-found`
 * (`openapi/internal/task-service.yaml`). Call it inside `TasksUnitOfWork.run`: the directory joins
 * the tenant transaction.
 */
export class ViewerResolver {
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
   * Method resolve
   *
   * @description
   * Finds the viewer of an account in an organization.
   *
   * @param {string} organizationId - The organization of the request context.
   * @param {string} userId - The acting account.
   * @param {boolean} [lock] - `true` in a write use case: the membership stays locked `FOR SHARE`
   * until the commit, so that a concurrent removal waits for the write.
   * @returns {Promise<Viewer>} The account and its role.
   * @throws {TaskRefusal} `organization-not-found` when the account is not a current member.
   */
  public async resolve(organizationId: string, userId: string, lock = false): Promise<Viewer> {
    const role: MemberRole | null = await this.members.roleOf(organizationId, userId, lock);
    if (role === null) {
      throw new TaskRefusal({ reason: 'organization-not-found' });
    }
    return { userId, role };
  }
  // #endregion
}
