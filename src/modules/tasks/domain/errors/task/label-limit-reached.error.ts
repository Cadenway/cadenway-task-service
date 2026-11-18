import { DomainError } from './domain.error.js';

/**
 * Class LabelLimitReachedError
 *
 * @description
 * A new label for a task that already has 20 labels (`openapi/public/tasks.yaml:35-39` and
 * 1138-1140; `openapi/internal/task-service.yaml:1827-1837`): `422 task.label-limit-reached`.
 */
export class LabelLimitReachedError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the label.
   *
   * @constructor
   */
  public constructor() {
    super('A task has 20 labels at most.');
  }
  // #endregion
}
