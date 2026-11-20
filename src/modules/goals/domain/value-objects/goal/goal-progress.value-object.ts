import type { MeasuredGoalResult } from './measured-goal-result.value-object.js';

/** Unrounded progress and health of a goal based on its visible results (P3c brief, P3c-2). */
export interface GoalProgress {
  // #region Properties
  /** Current and expected percentages, health, and the results used to measure them. */
  readonly progressPercent: number;
  readonly expectedProgressPercent: number;
  readonly health: 'achieved' | 'on-track' | 'at-risk' | 'behind';
  readonly results: readonly MeasuredGoalResult[];
  // #endregion
}
