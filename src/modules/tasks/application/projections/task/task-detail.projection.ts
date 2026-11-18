import type { TaskView } from './task-view.projection.js';
import type { TaskReferenceView } from './task-reference.projection.js';
import type { TaskSummaryView } from './task-summary.projection.js';
import type { PlacedSpace } from '../../models/placement/placed-space.model.js';
import type { PlacedList } from '../../models/placement/placed-list.model.js';

/**
 * Interface TaskDetailView
 *
 * @description
 * The task detail (`TaskDetailCore` of the contract): the task, where it is, its parent and its
 * subtasks, read in one transaction.
 */
export interface TaskDetailView {
  // #region Properties
  /** The task. */
  readonly task: TaskView;

  /** The space it is in. */
  readonly space: PlacedSpace;

  /** The list it is in. */
  readonly list: PlacedList;

  /** Its parent, `null` for a top-level task. */
  readonly parent: TaskReferenceView | null;

  /** Its direct subtasks, in the order of their creation. */
  readonly subtasks: readonly TaskSummaryView[];
  // #endregion
}
