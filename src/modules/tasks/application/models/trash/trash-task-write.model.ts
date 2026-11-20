import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';

/**
 * Interface TrashTaskWrite
 *
 * @description
 * One task of a trash or a restoration to write: the task as it ends, and the version it had under
 * its lock, which guards the write. A move to the trash and a restoration take one version; an
 * archived member of a restored entry takes two (restored, then archived again as of the
 * restoration).
 */
export interface TrashTaskWrite {
  // #region Properties
  /** The task after the change. */
  readonly task: Task;

  /** The version read under its lock, which the stored row must still have. */
  readonly versionBefore: number;
  // #endregion
}
