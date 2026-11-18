import { DomainError } from '../task/domain.error.js';

/**
 * Class SubtaskDepthExceededError
 *
 * @description
 * A subtask that would sit below the third level: a new subtask under a parent at the third level,
 * or a task whose subtree would not fit within 3 levels under its new parent
 * (`openapi/public/tasks.yaml:28-33`, 440-441 and 835-836; `SubtaskDepthExceeded` example,
 * `openapi/public/tasks.yaml:2022-2028`): `422 task.subtask-depth-exceeded`.
 */
export class SubtaskDepthExceededError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the level.
   *
   * @constructor
   */
  public constructor() {
    super('A task has 3 levels at most: task, subtask and sub-subtask.');
  }
  // #endregion
}
