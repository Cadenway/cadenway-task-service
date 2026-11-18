import type { Task } from '../../aggregates/task/task.aggregate.js';
import type { TaskField } from './task-field.value-object.js';

/**
 * Interface TaskUpdate
 *
 * @description
 * The result of a change of a task: the task after it and the members that changed. When
 * `changed` is empty, nothing changed and `task` is the same instance as before: the application
 * writes nothing, records no activity and emits nothing, and answers with the same version
 * (`openapi/public/tasks.yaml:455-456`), since `changed` of `task.updated.v1` has at least one
 * member (`asyncapi/task-service.yaml:324-328`). Otherwise the task is at the next version.
 */
export interface TaskUpdate {
  // #region Properties
  /**
   * Property task
   *
   * @description
   * The task after the change.
   *
   * @type {Task}
   * @readonly
   */
  readonly task: Task;

  /**
   * Property changed
   *
   * @description
   * The members whose value differs, in the order of `TASK_FIELDS`.
   *
   * @type {readonly TaskField[]}
   * @readonly
   */
  readonly changed: readonly TaskField[];
  // #endregion
}
