import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskSummaryView } from '../task/task-summary.projection.js';

/**
 * Interface ArchivedRootView
 *
 * @description
 * The root of an archive as a page of the archived tasks reads it: its summary, whose subtask
 * counts are those of the subtasks archived with it, and when and by whom the archive was made.
 */
export interface ArchivedRootView {
  // #region Properties
  /** The root, summarized. */
  readonly task: TaskSummaryView;

  /** When the archive was made. */
  readonly archivedAt: Date;

  /** Who made it. */
  readonly archivedBy: TaskActor;
  // #endregion
}
