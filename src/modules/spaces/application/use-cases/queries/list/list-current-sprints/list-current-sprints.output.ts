import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';

/**
 * Interface ListCurrentSprintsOutput
 *
 * @description
 * The sprints under way a member has a role on.
 */
export interface ListCurrentSprintsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * The sprints the member has a role on whose period holds the day, bounds included, by end date,
   * then creation, each with that role.
   *
   * @type {readonly VisibleList[]}
   * @readonly
   */
  readonly lists: readonly VisibleList[];
  // #endregion
}
