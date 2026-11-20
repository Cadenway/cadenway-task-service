import type { MeasuredGoalResult } from '../../../../../domain/value-objects/goal/measured-goal-result.value-object.js';

/** The readable result and its parent's version. */
export interface GetGoalResultOutput {
  // #region Properties
  /** The members of this application contract. */
  readonly result: MeasuredGoalResult;
  readonly version: number;
  // #endregion
}
