import type { TimeEntryPosition } from '../../../../models/time/time-entry-position.model.js';
import type { TimeTaskActor } from '../../../../models/time/time-task-actor.model.js';

/** Task time operation data. */
export interface ListTaskTimeEntriesInput extends TimeTaskActor {
  // #region Properties
  /** The stored value. */
  readonly after: TimeEntryPosition | null;
  readonly limit: number;
  // #endregion
}
