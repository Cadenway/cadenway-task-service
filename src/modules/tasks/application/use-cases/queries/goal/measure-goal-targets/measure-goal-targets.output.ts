import type { GoalListCount } from '../../../../models/goal/goal-list-count.model.js';

/** Currently readable target measurements keyed by their supplied stable identifiers. */
export interface MeasureGoalTargetsOutput {
  // #region Properties
  /** Visible list counts and milestone completion flags. */
  readonly lists: ReadonlyMap<string, GoalListCount>;
  readonly milestones: ReadonlyMap<string, boolean>;
  // #endregion
}
