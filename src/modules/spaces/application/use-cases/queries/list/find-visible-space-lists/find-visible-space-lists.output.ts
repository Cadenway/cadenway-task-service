import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';

/**
 * Interface FindVisibleSpaceListsOutput
 *
 * @description
 * The lists of a space the member sees.
 */
export interface FindVisibleSpaceListsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * Every list and sprint of the space, in the order of their creation.
   *
   * @type {readonly VisibleList[]}
   * @readonly
   */
  readonly lists: readonly VisibleList[];
  // #endregion
}
