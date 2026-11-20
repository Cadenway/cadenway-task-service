import type { DependencyCandidatePosition } from '../../models/dependency/dependency-candidate-position.model.js';
import type { TaskSummaryView } from '../task/task-summary.projection.js';

/** A page of editable candidate tasks and its scoped total. */
export interface DependencyCandidatePage {
  // #region Properties
  /** Candidates in same-list, name and key order. */
  readonly items: readonly TaskSummaryView[];

  /** Last row of this page when a following page exists. */
  readonly next: DependencyCandidatePosition | null;

  /** Total matching candidates the caller can edit. */
  readonly total: number;
  // #endregion
}
