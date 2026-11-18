import { DomainError } from '../task/domain.error.js';

/**
 * Class SubtaskLimitReachedError
 *
 * @description
 * A new direct subtask, created or attached, for a parent that already has 25
 * (`openapi/public/tasks.yaml:28-33`, 441-442 and 836-837; `SubtaskLimitReached` example,
 * `openapi/public/tasks.yaml:2029-2035`): `422 task.subtask-limit-reached`.
 */
export class SubtaskLimitReachedError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the subtask.
   *
   * @constructor
   */
  public constructor() {
    super('A task has 25 direct subtasks at most.');
  }
  // #endregion
}
