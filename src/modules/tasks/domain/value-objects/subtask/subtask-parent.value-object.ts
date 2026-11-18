import type { TaskKey } from '../task/task-key.value-object.js';

/**
 * Interface SubtaskParent
 *
 * @description
 * A task that receives a subtask, created under it or attached to it, as the application reads it
 * under lock: where it is, its level and how many direct subtasks it has
 * (`openapi/public/tasks.yaml:28-33`, 437-442 and 832-837). `Task.asParent` builds it from a
 * restored task.
 */
export interface SubtaskParent {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the parent.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property key
   *
   * @description
   * Key of the parent, the `parentKey` of its subtasks.
   *
   * @type {TaskKey}
   * @readonly
   */
  readonly key: TaskKey;

  /**
   * Property listId
   *
   * @description
   * List of the parent, which its subtasks are always in.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property spaceId
   *
   * @description
   * Space of that list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property level
   *
   * @description
   * Level of the parent: 1 for a top-level task, 2 for a subtask, 3 for a sub-subtask.
   *
   * @type {number}
   * @readonly
   */
  readonly level: number;

  /**
   * Property childCount
   *
   * @description
   * Number of its direct subtasks before the change.
   *
   * @type {number}
   * @readonly
   */
  readonly childCount: number;
  // #endregion
}
