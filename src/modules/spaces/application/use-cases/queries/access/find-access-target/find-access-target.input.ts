import type { AccessTargetRef } from '../../../../models/access/access-target-ref.model.js';

/**
 * Interface FindAccessTargetInput
 *
 * @description
 * The space or the list an access request names, and the member who asks for it or answers
 * it.
 */
export interface FindAccessTargetInput {
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
   * Property viewerUserId
   *
   * @description
   * The account of the member.
   *
   * @type {string}
   * @readonly
   */
  readonly viewerUserId: string;

  /**
   * Property viewerRole
   *
   * @description
   * The role of the member in the organization, as the copy of the memberships holds it;
   * the caller read it in its own transaction, never from the `role` claim of the token.
   *
   * @type {'owner' | 'admin' | 'member' | 'guest'}
   * @readonly
   */
  readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';

  /**
   * Property target
   *
   * @description
   * The space or the list.
   *
   * @type {AccessTargetRef}
   * @readonly
   */
  readonly target: AccessTargetRef;
  // #endregion
}
