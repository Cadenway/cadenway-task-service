import type { GoalPatch } from '../../../../../domain/value-objects/goal/goal-patch.value-object.js';
import type { GoalWrite } from '../../../../models/goal/goal-write.model.js';

/** A conditional metadata patch and its reference date. */
export interface UpdateGoalInput extends GoalWrite {
  // #region Properties
  /** The members of this application contract. */
  readonly patch: GoalPatch;
  readonly today: string;
  // #endregion
}
