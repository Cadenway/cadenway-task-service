import type { GoalCaller } from '../../../../models/goal/goal-caller.model.js';

/** Identifies a goal and the caller's reference date. */
export interface GetGoalInput extends GoalCaller {
  // #region Properties
  /** The members of this application contract. */
  readonly goalId: string;
  readonly today: string;
  // #endregion
}
