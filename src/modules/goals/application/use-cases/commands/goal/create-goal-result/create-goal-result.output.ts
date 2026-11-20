import type { MeasuredGoalResult } from '../../../../../domain/value-objects/goal/measured-goal-result.value-object.js';

/** The created result and its parent's new version. */
export interface CreateGoalResultOutput {
  // #region Properties
  /** The members of this application contract. */
  readonly result: MeasuredGoalResult;
  readonly version: number;
  // #endregion
}
