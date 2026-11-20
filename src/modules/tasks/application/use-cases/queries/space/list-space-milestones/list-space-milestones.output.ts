import type { MilestonePosition } from '../../../../models/query/milestone-position.model.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';

/** One page of milestones and the total matching current visibility. */
export interface ListSpaceMilestonesOutput {
  // #region Properties
  /** Visible live milestones, with dated tasks first. */
  readonly items: readonly TaskSummaryView[];

  /** Cursor position when an additional row was found. */
  readonly next: MilestonePosition | null;

  /** Matching milestones across all eligible lists. */
  readonly total: number;
  // #endregion
}
