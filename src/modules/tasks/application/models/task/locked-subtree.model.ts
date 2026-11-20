import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { SubtreeShape } from '../../../domain/value-objects/subtask/subtree-shape.value-object.js';

/**
 * Interface LockedSubtree
 *
 * @description
 * The live descendants of a task locked by `TaskSubtreeLocker`, with the other tasks asked for,
 * its root when requested, and the live subtree they were locked against.
 */
export interface LockedSubtree {
  // #region Properties
  /** The locked live descendants, requested root and other tasks, as read under their locks. */
  readonly tasks: readonly Task[];

  /** The live subtree as the last read, under the locks, found it. */
  readonly shape: SubtreeShape;
  // #endregion
}
