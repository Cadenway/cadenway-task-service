import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { ListPlacement } from '../placement/list-placement.model.js';

/**
 * Interface LocatedTask
 *
 * @description
 * A task the actor sees, with the list and the space it is in.
 */
export interface LocatedTask {
  // #region Properties
  /** The task, locked when it was asked for a write. */
  readonly task: Task;

  /** Its list and its space, as the actor sees them. */
  readonly placement: ListPlacement;
  // #endregion
}
