import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';
import type { VisibleSpace } from '../../../../projections/space/visible-space.projection.js';

/**
 * Interface FindVisibleListOutput
 *
 * @description
 * A list the member sees, with its space (the statuses the space hides, its prefix and the key its
 * next task would take).
 */
export interface FindVisibleListOutput {
  // #region Properties
  /**
   * Property list
   *
   * @description
   * The list.
   *
   * @type {VisibleList}
   * @readonly
   */
  readonly list: VisibleList;

  /**
   * Property space
   *
   * @description
   * The space of the list.
   *
   * @type {VisibleSpace}
   * @readonly
   */
  readonly space: VisibleSpace;
  // #endregion
}
