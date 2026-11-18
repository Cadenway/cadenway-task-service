import { DomainError } from './domain.error.js';

/**
 * Class AssigneeLimitReachedError
 *
 * @description
 * An assignment to a task that already has 20 assignees (`openapi/public/tasks.yaml:35-36` and
 * 1041-1042; `openapi/internal/task-service.yaml:1813-1826`): `422 task.assignee-limit-reached`.
 */
export class AssigneeLimitReachedError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the assignment.
   *
   * @constructor
   */
  public constructor() {
    super('A task has 20 assignees at most.');
  }
  // #endregion
}
