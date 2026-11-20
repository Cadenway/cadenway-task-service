import type { TimeTaskActor } from '../../../../models/time/time-task-actor.model.js';

/** Task time operation data. */
export interface DeleteTaskTimeEntryInput extends TimeTaskActor {
  // #region Properties
  /** The stored value. */
  readonly timeEntryId: string;
  // #endregion
}
