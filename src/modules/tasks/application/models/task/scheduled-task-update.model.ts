import type { NextOccurrenceSchedule } from '../../../domain/value-objects/task/next-occurrence-schedule.value-object.js';
import type { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskUpdate } from '../../../domain/value-objects/task/task-update.value-object.js';

/** A validated update and its reserved successor, if the status transition needs one. */
export interface ScheduledTaskUpdate {
  // #region Properties
  /** The update to persist once. */
  readonly update: TaskUpdate;

  /** The successor's schedule and reserved key, present together. */
  readonly successor: { readonly schedule: NextOccurrenceSchedule; readonly key: TaskKey } | null;
  // #endregion
}
