import type { MeasuredGoalResult } from '../../../../../domain/value-objects/goal/measured-goal-result.value-object.js';

/** The changed result and its parent's version. */
export interface UpdateGoalResultOutput {
  // #region Properties
  /** The members of this application contract. */
  readonly result: MeasuredGoalResult;
  readonly version: number;
  // #endregion
}
