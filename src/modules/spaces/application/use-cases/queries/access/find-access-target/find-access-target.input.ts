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

  /**
   * Property lock
   *
   * @description
   * `share` to read the row of the target (the space for a space, the list for a list)
   * `FOR SHARE` until the end of the transaction of the caller, so that a deletion of it, which
   * locks it `FOR NO KEY UPDATE`, either committed first (the target reads unknown) or waits for
   * the caller; `none` (the default) to read it without lock.
   *
   * @type {'none' | 'share' | undefined}
   * @readonly
   */
  readonly lock?: 'none' | 'share';
  // #endregion
}
