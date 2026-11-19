/**
 * Interface ListVisibleListIdsOutput
 *
 * @description
 * The ids of the lists a member has a role on.
 */
export interface ListVisibleListIdsOutput {
  // #region Properties
  /**
   * Property listIds
   *
   * @description
   * The ids, archived lists included, in the order of the sidebar (spaces by creation, then
   * the lists of each by their position there); empty when the member has a role on no list.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];
  // #endregion
}
