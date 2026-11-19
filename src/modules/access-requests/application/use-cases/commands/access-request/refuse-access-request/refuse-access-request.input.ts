/**
 * Interface RefuseAccessRequestInput
 *
 * @description
 * The refusal of a request (`POST /internal/v1/access-requests/{accessRequestId}/refusal`).
 */
export interface RefuseAccessRequestInput {
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
   * The account that refuses.
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
  // #endregion
}
