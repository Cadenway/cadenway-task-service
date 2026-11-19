import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskSummaryView } from '../task/task-summary.projection.js';
import type { ListRefView } from './list-ref.projection.js';

/**
 * Interface ArchivedTaskView
 *
 * @description
 * A task of the archives ("Archives", tab "Tâches"; `ArchivedTask` of
 * `openapi/internal/task-service.yaml`): the root of a subtree archived together, its list as it
 * is now, how many subtasks were archived with it, and when and by whom.
 */
export interface ArchivedTaskView {
  // #region Properties
  /** The root, summarized. */
  readonly task: TaskSummaryView;

  /** Its list. */
  readonly list: ListRefView;

  /** The subtasks archived with it, at every level: the members of the archive but the root. */
  readonly subtaskCount: number;

  /** When the archive was made. */
  readonly archivedAt: Date;

  /** Who made it. */
  readonly archivedBy: TaskActor;
  // #endregion
}
