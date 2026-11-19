import type { AccessTargetRef } from '../../../../models/access/access-target-ref.model.js';

/**
 * Interface GrantRequestedAccessInput
 *
 * @description
 * The approval of an access request: the grant to give or raise. The caller checked that the
 * actor answers requests for the target, and runs this in its own transaction, which the use case
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
