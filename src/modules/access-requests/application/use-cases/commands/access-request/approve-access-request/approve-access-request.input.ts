import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface ApproveAccessRequestInput
 *
 * @description
 * The approval of a request with a role (`POST /internal/v1/access-requests/{accessRequestId}/approval`).
 */
export interface ApproveAccessRequestInput {
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
   * The account that approves.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property accessRequestId
   *
   * @description
   * The request, in lower case.
   *
   * @type {string}
   * @readonly
   */
  readonly accessRequestId: string;

  /**
   * Property role
   *
   * @description
   * The role the requester receives at least.
   *
   * @type {AccessRole}
   * @readonly
   */
  readonly role: AccessRole;
  // #endregion
}
