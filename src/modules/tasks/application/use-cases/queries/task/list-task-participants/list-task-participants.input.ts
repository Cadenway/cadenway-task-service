import type { Caller } from '../../../../models/caller/caller.model.js';

/** The verified caller, task key and decoded position of a participant page. */
export interface ListTaskParticipantsInput extends Caller {
  // #region Properties
  /** The task key scoped to the caller's organization. */
  readonly taskKey: string;

  /** The last user ID of the previous page, or null. */
  readonly after: string | null;

  /** The requested maximum number of participants. */
  readonly limit: number;
  // #endregion
}
