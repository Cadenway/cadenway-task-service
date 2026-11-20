import type { GoalWrite } from '../../../../models/goal/goal-write.model.js';
import type { NewGoalResult } from '../../../../models/goal/new-goal-result.model.js';

/** A conditional append to the goal's result collection. */
export interface CreateGoalResultInput extends GoalWrite {
  // #region Properties
  /** The members of this application contract. */
  readonly result: NewGoalResult;
  // #endregion
}
