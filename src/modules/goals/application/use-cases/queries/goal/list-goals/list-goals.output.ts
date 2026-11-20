import type { GoalPageSummary } from '../../../../models/goal/goal-page-summary.model.js';
import type { GoalPosition } from '../../../../models/goal/goal-position.model.js';
import type { GoalView } from '../../../../models/goal/goal-view.model.js';

/** A page and summary of all currently readable goals in the quarter. */
export interface ListGoalsOutput {
  // #region Properties
  /** The members of this application contract. */
  readonly items: readonly GoalView[];
  readonly nextPosition: GoalPosition | null;
  readonly summary: GoalPageSummary;
  // #endregion
}
