import type { TimeTaskActor } from '../../../../models/time/time-task-actor.model.js';

/** The verified actor and new work log. */
export interface CreateTaskTimeEntryInput extends TimeTaskActor {
  // #region Properties
  /** The stored value. */
  readonly minutes: number;
  readonly workDate: string;
  readonly note: string | null;
  // #endregion
}
