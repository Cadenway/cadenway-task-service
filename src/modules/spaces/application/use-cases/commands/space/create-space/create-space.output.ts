import type { TaskListState } from '../../../../../domain/value-objects/list/task-list-state.value-object.js';
import type { SpaceView } from '../../../../projections/space/space-view.projection.js';

/**
 * Interface CreateSpaceOutput
 *
 * @description
 * The new space and its first list "Première liste", created together.
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
   * @type {TaskListState}
   * @readonly
   */
  readonly firstList: TaskListState;
  // #endregion
}
