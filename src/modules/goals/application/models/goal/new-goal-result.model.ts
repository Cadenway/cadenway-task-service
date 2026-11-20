import type { GoalResult } from '../../../domain/value-objects/goal/goal-result.value-object.js';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

/** A validated result creation before its database identifier is assigned. */
export type NewGoalResult = WithoutId<GoalResult>;
