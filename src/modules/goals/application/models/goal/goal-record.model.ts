import type { Goal } from '../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalPosition } from './goal-position.model.js';

/** A stored aggregate and its stable collection ordering. */
export interface GoalRecord {
  // #region Properties
  /** The members of this application contract. */
  readonly goal: Goal;
  readonly position: GoalPosition;
  // #endregion
}
