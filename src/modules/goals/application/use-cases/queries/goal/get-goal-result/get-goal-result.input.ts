import type { GoalCaller } from '../../../../models/goal/goal-caller.model.js';

/** Identifies one result of a goal in the caller's tenant. */
export interface GetGoalResultInput extends GoalCaller {
  // #region Properties
  /** The members of this application contract. */
  readonly goalId: string;
  readonly resultId: string;
  // #endregion
}
