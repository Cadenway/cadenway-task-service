import type { PriorSprint } from '../../../../projections/reporting/prior-sprint.projection.js';

/** The four most recent readable completed prior sprints in chronological order. */
export interface ListPriorSprintsOutput {
  // #region Properties
  /** Ordered by end date, then list ID, oldest first. */
  readonly sprints: readonly PriorSprint[];
  // #endregion
}
