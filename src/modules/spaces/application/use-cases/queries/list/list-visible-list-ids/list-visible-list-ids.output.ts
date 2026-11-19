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
   * The ids, in the order of the sidebar (spaces by creation, then lists by creation);
   * empty when the member has a role on no list.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];
  // #endregion
}
