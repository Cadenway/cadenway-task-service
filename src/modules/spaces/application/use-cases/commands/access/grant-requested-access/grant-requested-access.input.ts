import type { AccessTargetRef } from '../../../../models/access/access-target-ref.model.js';

/**
 * Interface GrantRequestedAccessInput
 *
 * @description
 * The approval of an access request: the grant to give or raise. The caller checked that the
 * actor answers requests for the target; the use case checks it again on the locked space or list
 * (a change of access may commit between the two), and runs in the caller's transaction, which it
 * joins.
 */
export interface GrantRequestedAccessInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the context, the one of the tenant transaction the use case
   * joins.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account that approves, `grantedBy` of the grant and the actor of the event.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property actorRole
   *
   * @description
   * The role of the actor in the organization, as the caller read it from the copy of the
   * memberships in the same transaction, for the check on the locked rows.
   *
   * @type {'owner' | 'admin' | 'member' | 'guest'}
   * @readonly
   */
  readonly actorRole: 'owner' | 'admin' | 'member' | 'guest';

  /**
   * Property target
   *
   * @description
   * The space, or the list (of a list or a task request).
   *
   * @type {AccessTargetRef}
   * @readonly
   */
  readonly target: AccessTargetRef;

  /**
   * Property granteeUserId
   *
   * @description
   * The requester, who receives the grant.
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
   * @type {'edit' | 'comment' | 'view'}
   * @readonly
   */
  readonly role: 'edit' | 'comment' | 'view';
  // #endregion
}
