/**
 * Interface Caller
 *
 * @description
 * The organization and the user the verified internal token acts for, the two members every use
 * case of the access-requests routes takes first.
 */
export interface Caller {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified internal token, in lower case.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account of the actor of the internal token, in lower case.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;
  // #endregion
}
