import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';

/**
 * Interface FindVisibleListsOutput
 *
 * @description
 * Those of the lists asked for that the member has a role on.
 */
export interface FindVisibleListsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * The lists, archived ones included, each with its archive and the role of the member, in no
   * particular order; a list asked for twice comes once.
   *
   * @type {readonly VisibleList[]}
   * @readonly
   */
  readonly lists: readonly VisibleList[];
  // #endregion
}
