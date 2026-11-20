import type { GoalCaller } from '../../../../models/goal/goal-caller.model.js';
import type { NewGoalResult } from '../../../../models/goal/new-goal-result.model.js';

/** Validated creation and the verified organization context. */
export interface CreateGoalInput extends GoalCaller {
  // #region Properties
  /** The members of this application contract. */
  readonly name: string;
  readonly ownerUserId: string;
  readonly dueDate: string;
  readonly quarter: string;
  readonly spaceId: string | null;
  readonly results: readonly NewGoalResult[];
  readonly today: string;
  // #endregion
}
