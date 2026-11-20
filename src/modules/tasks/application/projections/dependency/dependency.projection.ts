import type { TaskSummaryView } from '../task/task-summary.projection.js';

/** A directed dependency with both task summaries visible to the caller. */
export interface DependencyView {
  // #region Properties
  /** Id of the dependency. */
  readonly id: string;

  /** Task that blocks the other. */
  readonly blocker: TaskSummaryView;

  /** Task that the blocker blocks. */
  readonly blocked: TaskSummaryView;
  // #endregion
}
