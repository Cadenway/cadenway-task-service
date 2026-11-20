import type { GoalCaller } from './goal-caller.model.js';

/** A conditional write to an existing goal. */
export interface GoalWrite extends GoalCaller {
  // #region Properties
  /** The members of this application contract. */
  readonly goalId: string;
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
