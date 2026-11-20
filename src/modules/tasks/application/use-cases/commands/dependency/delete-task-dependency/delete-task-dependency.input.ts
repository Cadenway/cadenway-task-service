import type { DependencyActor } from '../../../../models/dependency/dependency-actor.model.js';

/** Removes an existing edge from either endpoint. */
export interface DeleteTaskDependencyInput extends DependencyActor {
  // #region Properties
  /** Dependency id in the route. */
  readonly dependencyId: string;

  /** Accepted anchor versions, or null when the header accepts any version. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
