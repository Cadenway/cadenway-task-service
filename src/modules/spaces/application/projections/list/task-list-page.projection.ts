import type { PagePosition } from '../../models/page/page-position.model.js';
import type { ListView } from './list-view.projection.js';

/**
 * Interface TaskListPage
 *
 * @description
 * One page of the lists of a space the caller has a role on, in the order of their creation.
 */
export interface TaskListPage {
  // #region Properties
  /**
   * Property items
   *
   * @description
   * The lists of the page, each with the role of the caller.
   *
   * @type {readonly ListView[]}
   * @readonly
   */
  readonly items: readonly ListView[];

  /**
   * Property next
   *
   * @description
   * Where the next page starts, `null` on the last page.
   *
   * @type {PagePosition | null}
   * @readonly
   */
  readonly next: PagePosition | null;
  // #endregion
}
