/**
 * Interface UnassignRemovedMemberOutput
 *
 * @description
 * How many tasks the former member was removed from.
 */
export interface UnassignRemovedMemberOutput {
  // #region Properties
  /** The number of tasks changed, 0 when none, or when the account is still a member. */
  readonly unassigned: number;
  // #endregion
}
