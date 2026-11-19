import type { RequestedTargetRef } from '../../../../models/access-request/requested-target-ref.model.js';

/**
 * Interface CreateAccessRequestInput
 *
 * @description
 * A request of the actor for access (`POST /internal/v1/access-requests`), validated by the
 * presentation layer: exactly one target, a message of 500 characters at most.
 */
export interface CreateAccessRequestInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account of the actor, the requester.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property target
   *
   * @description
   * The space, the list or the task asked for; ids in lower case.
   *
   * @type {RequestedTargetRef}
   * @readonly
   */
  readonly target: RequestedTargetRef;

  /**
   * Property message
   *
   * @description
   * The message as typed, `null` for none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly message: string | null;
  // #endregion
}
