import type { MeasuredGoalResult } from '../../../domain/value-objects/goal/measured-goal-result.value-object.js';

/** The caller-visible projection of a goal. */
export interface GoalView {
  // #region Properties
  /** The members of this application contract. */
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly dueDate: string;
  readonly spaceId: string | null;
  readonly quarter: string;
  readonly version: number;
  readonly progressPercent: number;
  readonly health: 'achieved' | 'on-track' | 'at-risk' | 'behind';
  readonly results: readonly MeasuredGoalResult[];
  // #endregion
}
