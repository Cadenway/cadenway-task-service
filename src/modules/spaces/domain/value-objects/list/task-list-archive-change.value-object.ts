import type { TaskList } from '../../aggregates/list/task-list.aggregate.js';

/**
 * Interface TaskListArchiveChange
 *
 * @description
 * The result of an archive or a restoration of a list ("Lists" of `openapi/public/archives.yaml`):
 * the list after it and whether it changed. A list archived already, or restored while it is
 * live, does not change: `list` is the same instance, at the same version, and the application
 * stores nothing and emits nothing (`200` with the same version).
 */
export interface TaskListArchiveChange {
  // #region Properties
  /**
   * Property list
   *
   * @description
   * The list after the archive or the restoration.
   *
   * @type {TaskList}
   * @readonly
   */
  readonly list: TaskList;

  /**
   * Property changed
   *
   * @description
   * Whether the list changed, at the next version.
   *
   * @type {boolean}
   * @readonly
   */
  readonly changed: boolean;
  // #endregion
}
