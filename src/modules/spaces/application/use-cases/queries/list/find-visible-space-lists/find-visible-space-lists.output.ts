import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';

/**
 * Interface FindVisibleSpaceListsOutput
 *
 * @description
 * The lists of a space the member sees that they have a role on.
 */
export interface FindVisibleSpaceListsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * The live lists and sprints of the space the member has a role on, each with that role, in
   * their order in the space (their last restoration, or else their creation).
   *
   * @type {readonly VisibleList[]}
   * @readonly
   */
  readonly lists: readonly VisibleList[];
  // #endregion
}
