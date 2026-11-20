import type { SprintLifetime } from '../../../../models/reporting/sprint-lifetime.model.js';

/** The requested sprints still visible in the caller's current snapshot. */
export interface ResolveSprintLifetimesOutput {
  // #region Properties
  /** Current visible sprint metadata and historical periods. */
  readonly sprints: readonly SprintLifetime[];
  // #endregion
}
