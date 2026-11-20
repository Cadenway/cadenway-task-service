import type { Recurrence } from './recurrence.value-object.js';
import type { TaskKey } from './task-key.value-object.js';

/** Persistent recurrence state of a task (P3b-2 decisions 13–14). */
export interface TaskRecurrence {
  // #region Properties
  /** Current cadence, reset to `none` when this task spawns its successor. */
  readonly recurrence: Recurrence;

  /** Original day of an inherited monthly chain. A new chain derives it from the due date. */
  readonly monthlyAnchorDay: number | null;

  /** Stable historical marker, preserved even when the successor is purged. */
  readonly nextOccurrenceKey: TaskKey | null;
  // #endregion
}
