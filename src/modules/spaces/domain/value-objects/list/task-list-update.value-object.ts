import type { TaskList } from '../../aggregates/list/task-list.aggregate.js';
import type { TaskListField } from './task-list-field.value-object.js';

/**
 * Interface TaskListUpdate
 *
 * @description
 * The result of a change of a list: the list after it and the members that changed. When
 * `changed` is empty, nothing changed and `list` is the same instance as before: the application
 * stores nothing and emits no `list.updated.v1`, whose `changed` has at least one member
 * (`asyncapi/task-service.yaml`).
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
  // #endregion
}
