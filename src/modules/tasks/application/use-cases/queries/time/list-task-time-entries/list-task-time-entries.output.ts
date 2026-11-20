import type { TimeEntryPosition } from '../../../../models/time/time-entry-position.model.js';
import type { TaskTimeEntryView } from '../../../../projections/time/task-time-entry-view.projection.js';

/** Task time operation data. */
export interface ListTaskTimeEntriesOutput {
  // #region Properties
  /** The stored value. */
  readonly items: readonly TaskTimeEntryView[];
  readonly next: TimeEntryPosition | null;
  readonly total: number;
  readonly totalMinutes: number;
  // #endregion
}
