import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { TrashEntryRecord } from './trash-entry-record.model.js';

/**
 * Interface TrashedTree
 *
 * @description
 * A tree of tasks once in the trash: the entry it made and its tasks, the root first, each at the
 * version of its move to the trash.
 */
export interface TrashedTree {
  // #region Properties
  /** The entry, stored. */
  readonly entry: TrashEntryRecord;

  /** Its root, in the trash. */
  readonly root: Task;

  /** Its tasks, the root included, in the trash. */
  readonly tasks: readonly Task[];
  // #endregion
}
