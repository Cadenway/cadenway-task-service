/**
 * Interface ListVisibleSpaceIdsOutput
 *
 * @description
 * The ids of the spaces a member sees.
 */
export interface ListVisibleSpaceIdsOutput {
  // #region Properties
  /**
   * Property spaceIds
   *
   * @description
   * The ids, in the order of the creation of the spaces; empty for a guest.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly spaceIds: readonly string[];
  // #endregion
}
