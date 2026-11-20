import type { TaskTimeEntry } from '../../models/time/task-time-entry.model.js';

/** A work log with its externally visible task key. */
export interface TaskTimeEntryView extends TaskTimeEntry {
  // #region Properties
  /** The stored value. */
  readonly taskKey: string;
  // #endregion
}
