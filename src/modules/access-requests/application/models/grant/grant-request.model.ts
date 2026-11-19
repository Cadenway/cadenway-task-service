import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';
import type { TargetRef } from '../target/target-ref.model.js';

/**
 * Interface GrantRequest
 *
 * @description
 * The grant an approval asks the spaces module to give or raise, in the transaction of the
 * approval: the use case already checked that the actor answers the requests of the target.
 */
export interface GrantRequest {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the transaction.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account that approves, who gives the grant.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property actorRole
   *
   * @description
   * The role of the actor in the organization, from the copy of the memberships, which the spaces
   * module checks the manager rule with again on the locked rows.
   *
   * @type {MemberRole}
   * @readonly
   */
  readonly actorRole: MemberRole;

  /**
   * Property target
   *
   * @description
   * The space, or the list of a list or a task request.
   *
   * @type {TargetRef}
   * @readonly
   */
  readonly target: TargetRef;

  /**
   * Property granteeUserId
   *
   * @description
   * The requester.
   *
   * @type {string}
   * @readonly
   */
  readonly granteeUserId: string;

  /**
   * Property role
   *
   * @description
   * The role the approval gives at least.
   *
   * @type {AccessRole}
   * @readonly
   */
  readonly role: AccessRole;
  // #endregion
}
