import type { StatusKey } from '../task/status-key.value-object.js';

/** Elapsed milliseconds and the measured history boundary at one server observation. */
export interface StatusDurationSummary {
  // #region Properties
  /** The instant used to end the current span. */
  readonly observedAt: Date;

  /** The oldest reliable boundary, or the observation instant when none is recorded. */
  readonly coverageStartedAt: Date;

  /** Whether the recorded history covers the task from its creation. */
  readonly complete: boolean;

  /** Totals in first-appearance order, including the observed current status. */
  readonly durations: readonly {
    readonly status: StatusKey;
    readonly durationMilliseconds: number;
    readonly active: boolean;
  }[];
  // #endregion
}
