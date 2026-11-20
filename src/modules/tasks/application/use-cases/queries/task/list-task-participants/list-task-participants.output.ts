import type { TaskParticipant } from '../../../../projections/task/task-participant.projection.js';

/** One page of eligible membership identifiers with an optional continuation position. */
export interface ListTaskParticipantsOutput {
  // #region Properties
  /** Current participants ordered by user ID. */
  readonly items: readonly TaskParticipant[];

  /** The last returned user ID if another page exists, or null. */
  readonly next: string | null;
  // #endregion
}
