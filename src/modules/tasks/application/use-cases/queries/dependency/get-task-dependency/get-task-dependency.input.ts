import type { DependencyActor } from '../../../../models/dependency/dependency-actor.model.js';

/** Reads one visible edge from the anchor. */
export interface GetTaskDependencyInput extends DependencyActor {
  // #region Properties
  /** Dependency id in the route. */
  readonly dependencyId: string;
  // #endregion
}
