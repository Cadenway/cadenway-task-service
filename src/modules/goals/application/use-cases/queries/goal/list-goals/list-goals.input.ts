import type { GoalCaller } from '../../../../models/goal/goal-caller.model.js';
import type { GoalPosition } from '../../../../models/goal/goal-position.model.js';

/** A validated keyset page and the context to which its cursor is bound. */
export interface ListGoalsInput extends GoalCaller {
  // #region Properties
  /** The members of this application contract. */
  readonly quarter: string;
  readonly today: string;
  readonly after: GoalPosition | null;
  readonly limit: number;
  // #endregion
}
