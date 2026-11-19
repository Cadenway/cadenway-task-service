import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { TaskListState } from '../../../domain/value-objects/list/task-list-state.value-object.js';

/**
 * Interface ListView
 *
 * @description
 * A list as the routes return it: its state, its switch "Accès de l’organisation" included, and
 * the effective role of the caller on it (`callerRole` of `TaskList`, decision 2 of P3b-1).
 */
export interface ListView {
  // #region Properties
  /**
   * Property list
   *
   * @description
   * The list.
   *
   * @type {TaskListState}
   * @readonly
   */
  readonly list: TaskListState;

  /**
   * Property callerRole
   *
   * @description
   * The role of the caller on the list; after a change that removed every role they had, the role
   * they made it with (`edit`).
   *
   * @type {AccessRole}
   * @readonly
   */
  readonly callerRole: AccessRole;
  // #endregion
}
