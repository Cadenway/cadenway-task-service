/**
 * Interface DropMemberAccessRequestsInput
 *
 * @description
 * The former member whose pending access requests the clean-up job drops, one batch per call.
 */
export interface DropMemberAccessRequestsInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the job context, the one of the tenant transaction.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property userId
   *
   * @description
   * The account that left the organization.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;
  // #endregion
}
