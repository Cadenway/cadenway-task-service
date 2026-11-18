/**
 * Interface ApplyMemberEventOutput
 *
 * @description
 * What a member event did beyond the copy of the memberships.
 */
export interface ApplyMemberEventOutput {
  // #region Properties
  /**
   * Property privateSpacesAwaitingOwner
   *
   * @description
   * For a removal: how many private spaces of the former member now await an owner, because the
   * copy does not hold the owner of the organization yet; 0 otherwise. The handler reports a
   * positive count once.
   *
   * @type {number}
   * @readonly
   */
  readonly privateSpacesAwaitingOwner: number;
  // #endregion
}
