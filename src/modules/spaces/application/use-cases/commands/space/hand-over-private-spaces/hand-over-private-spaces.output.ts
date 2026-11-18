/**
 * Interface HandOverPrivateSpacesOutput
 *
 * @description
 * What the handover of the private spaces of a member who left did.
 */
export interface HandOverPrivateSpacesOutput {
  // #region Properties
  /**
   * Property awaitingOwner
   *
   * @description
   * How many private spaces of the former member now await an owner, because the copy of the
   * memberships does not hold the owner of the organization yet; 0 when they were handed over or
   * there were none. The caller reports a positive count once, without personal data.
   *
   * @type {number}
   * @readonly
   */
  readonly awaitingOwner: number;
  // #endregion
}
