/**
 * Interface HandOverPrivateSpacesInput
 *
 * @description
 * A member who left the organization, whose private spaces pass to the owner of the organization (`member.removed.v1`).
 */
export interface HandOverPrivateSpacesInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the event, the one of its tenant transaction.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property formerOwnerUserId
   *
   * @description
   * The account of the member who left.
   *
   * @type {string}
   * @readonly
   */
  readonly formerOwnerUserId: string;
  // #endregion
}
