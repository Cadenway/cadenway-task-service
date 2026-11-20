import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';

/** Visible, non-trashed task locations among the requested identifiers. */
export interface FindVisibleTaskLocationsOutput {
  // #region Properties
  /** Current task locations, with each task returned at most once. */
  readonly tasks: readonly TaskLocation[];
  // #endregion
}
