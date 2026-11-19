import type { ListView } from '../../../../projections/list/list-view.projection.js';
import type { SpaceView } from '../../../../projections/space/space-view.projection.js';

/**
 * Interface CreateSpaceOutput
 *
 * @description
 * The new space and its first list "Première liste", created together, both with the access of
 * their creator (`edit`, and the space managed).
 */
export interface CreateSpaceOutput {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The space.
   *
   * @type {SpaceView}
   * @readonly
   */
  readonly space: SpaceView;

  /**
   * Property firstList
   *
   * @description
   * Its first list.
   *
   * @type {ListView}
   * @readonly
   */
  readonly firstList: ListView;
  // #endregion
}
