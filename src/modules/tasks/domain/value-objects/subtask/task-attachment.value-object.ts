import type { SubtaskParent } from './subtask-parent.value-object.js';
import type { SubtreeShape } from './subtree-shape.value-object.js';

/**
 * Interface TaskAttachment
 *
 * @description
 * A resolved `parentKey` of a patch ("Devenir sous-tâche de…", `openapi/public/tasks.yaml:437-444`):
 * the parent the caller sees, and the subtree of the task that would move under it. The
 * application builds it after it locked both; an unknown parent, or one the caller does not see,
 * never reaches the domain.
 */
export interface TaskAttachment {
  // #region Properties
  /**
   * Property parent
   *
   * @description
   * The new parent.
   *
   * @type {SubtaskParent}
   * @readonly
   */
  readonly parent: SubtaskParent;

  /**
   * Property subtree
   *
   * @description
   * The task being attached and its subtasks.
   *
   * @type {SubtreeShape}
   * @readonly
   */
  readonly subtree: SubtreeShape;
  // #endregion
}
