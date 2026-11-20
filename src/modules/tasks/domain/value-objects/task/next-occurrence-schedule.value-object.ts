import type { Recurrence } from './recurrence.value-object.js';

/** Schedule of a successor derived from a completed source (P3b-2 decisions 13–14). */
export interface NextOccurrenceSchedule {
  // #region Properties
  /** Cadence transferred to the successor. */
  readonly recurrence: Exclude<Recurrence, 'none'>;

  /** Original day of the month to carry through a short month, for a monthly cadence only. */
  readonly monthlyAnchorDay: number | null;

  /** Calendar due date of the successor. */
  readonly dueDate: string;

  /** Calendar start date shifted by the same number of days, when the source had one. */
  readonly startDate: string | null;
  // #endregion
}
