import type { GoalWrite } from './goal-write.model.js';

/** A conditional write to one result of an existing goal. */
export interface GoalResultWrite extends GoalWrite {
  // #region Properties
  /** The members of this application contract. */
  readonly resultId: string;
  // #endregion
}
