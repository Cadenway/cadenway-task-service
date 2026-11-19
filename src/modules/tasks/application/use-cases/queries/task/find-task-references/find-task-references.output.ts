import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';

/**
 * Interface FindTaskReferencesOutput
 *
 * @description
 * The tasks found.
 */
export interface FindTaskReferencesOutput {
  // #region Properties
  /**
   * Property tasks
   *
   * @description
   * The tasks, in no particular order; unknown ids are left out.
   *
   * @type {readonly TaskLocation[]}
   * @readonly
   */
  readonly tasks: readonly TaskLocation[];
  // #endregion
}
