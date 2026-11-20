import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';

/**
 * Interface TrashTree
 *
 * @description
 * A tree of tasks that makes one trash entry, as its writer holds it locked: its root and every
 * task taken with it, the root included.
 */
export interface TrashTree {
  // #region Properties
  /** The root of the entry. */
  readonly root: Task;

  /** The root and the tasks taken with it, each locked, without their checklists. */
  readonly members: readonly Task[];
  // #endregion
}
