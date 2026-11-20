import type { GoalResult } from './goal-result.value-object.js';

/** Visible key result with its derived percentage and, where applicable, link measurement. */
export type MeasuredGoalResult = (
  | Extract<GoalResult, { kind: 'number' | 'checkbox' }>
  | (Extract<GoalResult, { kind: 'list-progress' }> & {
      readonly eligibleTaskCount: number;
      readonly doneTaskCount: number;
    })
  | (Extract<GoalResult, { kind: 'milestone' }> & { readonly reached: boolean })
) & { readonly progressPercent: number };
