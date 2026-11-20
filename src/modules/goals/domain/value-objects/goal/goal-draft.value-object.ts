import type { GoalResult } from './goal-result.value-object.js';
import type { GoalState } from './goal-state.value-object.js';

/** Goal creation, with an optional owning space and initial key results. */
export interface GoalDraft extends Omit<GoalState, 'spaceId' | 'results' | 'version'> {
  // #region Properties
  /** Optional placement and initial key results for the new goal. */
  readonly spaceId?: string | null;
  readonly results?: readonly GoalResult[];
  // #endregion
}
