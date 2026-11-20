import type { GoalState } from './goal-state.value-object.js';

/** Mutable goal metadata. Quarter and placement are fixed by goal creation. */
export type GoalPatch = Partial<Pick<GoalState, 'name' | 'ownerUserId' | 'dueDate'>>;
