import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';

/**
 * Interface ListSidebarListsOutput
 *
 * @description
 * The first lists of the sidebar of a member.
 */
export interface ListSidebarListsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * The live lists the member has a role on, each with that role: spaces by creation, then the
   * lists of each by their position there (their last restoration, or else their creation).
   *
   * @type {readonly VisibleList[]}
   * @readonly
   */
  readonly lists: readonly VisibleList[];
  // #endregion
}
