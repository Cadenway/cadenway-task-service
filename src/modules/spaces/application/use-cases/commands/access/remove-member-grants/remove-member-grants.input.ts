/**
 * Interface RemoveMemberGrantsInput
 *
 * @description
 * The former member whose grants the clean-up job removes, one batch per call.
 */
export interface RemoveMemberGrantsInput {
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

  /** Membership that ended, absent on jobs created before membership-scoped grants. */
  readonly memberId?: string;
  // #endregion
}
