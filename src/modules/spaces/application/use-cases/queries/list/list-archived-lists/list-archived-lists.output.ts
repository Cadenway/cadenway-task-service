import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';

/**
 * Interface ListArchivedListsOutput
 *
 * @description
 * One page of the archived lists a member has a role on, and how many there are in all.
 */
export interface ListArchivedListsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * The lists of the page, the most recently archived first (`archivedAt` descending, id
   * descending), each with its archive and the role of the member; at most `limit`.
   *
   * @type {readonly VisibleList[]}
   * @readonly
   */
  readonly lists: readonly VisibleList[];

  /**
   * Property total
   *
   * @description
   * How many archived lists the member has a role on, every page included.
   *
   * @type {number}
   * @readonly
   */
  readonly total: number;
  // #endregion
}
