import type { GoalResultPatch } from '../../../../../domain/value-objects/goal/goal-result-patch.value-object.js';
import type { GoalResultWrite } from '../../../../models/goal/goal-result-write.model.js';

/** A conditional patch to an existing key result. */
export interface UpdateGoalResultInput extends GoalResultWrite {
  // #region Properties
  /** The members of this application contract. */
  readonly patch: GoalResultPatch;
  // #endregion
}
