import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';

/**
 * Interface ListCurrentSprintsOutput
 *
 * @description
 * The sprints under way in the spaces a member sees.
 */
export interface ListCurrentSprintsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * The sprints whose period holds the day, bounds included, by end date, then creation; empty for
   * a guest.
   *
   * @type {readonly VisibleList[]}
   * @readonly
   */
  readonly lists: readonly VisibleList[];
  // #endregion
}
