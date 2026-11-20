import type { DependencyView } from '../../../../projections/dependency/dependency.projection.js';

/** The new dependency and the version to return in the anchor ETag. */
export interface CreateTaskDependencyOutput {
  // #region Properties
  /** The newly stored dependency. */
  readonly dependency: DependencyView;

  /** Committed anchor version. */
  readonly version: number;
  // #endregion
}
