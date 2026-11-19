import type { TaskList } from '../../aggregates/list/task-list.aggregate.js';
import type { TaskListField } from './task-list-field.value-object.js';

/**
 * Interface TaskListUpdate
 *
 * @description
 * The result of a change of a list: the list after it, the members of its content that changed
 * and whether its switch "Accès de l’organisation" changed. When `changed` is empty and
 * `accessChanged` is `false`, nothing changed and `list` is the same instance as before: the
 * application stores nothing and emits nothing. A change of the content emits `list.updated.v1`
 * with `changed`, a change of the switch `list.access-changed.v1`, both with the one next version
 * the change took (`asyncapi/task-service.yaml`).
 */
export interface TaskListUpdate {
  // #region Properties
  /**
   * Property list
   *
   * @description
   * The list after the change.
   *
   * @type {TaskList}
   * @readonly
   */
  readonly list: TaskList;

  /**
   * Property changed
   *
   * @description
   * The members whose value differs, in the order of `TaskListField`.
   *
   * @type {readonly TaskListField[]}
   * @readonly
   */
  readonly changed: readonly TaskListField[];

  /**
   * Property accessChanged
   *
   * @description
   * Whether the switch "Accès de l’organisation" changed.
   *
   * @type {boolean}
   * @readonly
   */
  readonly accessChanged: boolean;
  // #endregion
}
