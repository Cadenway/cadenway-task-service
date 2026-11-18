import type { TaskListState } from '../../../domain/value-objects/list/task-list-state.value-object.js';
import type { PagePosition } from '../../models/page/page-position.model.js';

/**
 * Interface TaskListPage
 *
 * @description
 * One page of the lists of a space, in the order of their creation.
 */
export interface TaskListPage {
  // #region Properties
  /**
   * Property items
   *
   * @description
   * The lists of the page.
   *
   * @type {readonly TaskListState[]}
   * @readonly
   */
  readonly items: readonly TaskListState[];

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
