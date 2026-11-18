import { DomainError } from './domain.error.js';

/**
 * Class ChecklistLimitReachedError
 *
 * @description
 * A new item for a checklist that already holds 100 items (`openapi/public/tasks.yaml:41-43` and
 * 924-925; `openapi/internal/task-service.yaml:1838-1851`): `422 task.checklist-limit-reached`.
 */
export class ChecklistLimitReachedError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the item.
   *
   * @constructor
   */
  public constructor() {
    super('A checklist holds 100 items at most.');
  }
  // #endregion
}
