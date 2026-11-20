import type { StatusDurationSummary } from '../../../../../domain/value-objects/activity/status-duration-summary.value-object.js';

/** Task time operation data. */
export interface GetTaskStatusDurationsOutput {
  // #region Properties
  /** The stored value. */
  readonly summary: StatusDurationSummary | null;
  // #endregion
}
