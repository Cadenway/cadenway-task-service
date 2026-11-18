import { DomainError } from './domain.error.js';

/**
 * Class ListInvalidError
 *
 * @description
 * A patch that attaches a task to a parent and names, in `listId`, another list than the list of
 * that parent (`openapi/public/tasks.yaml:442-443`; `ListInvalid` example,
 * `openapi/public/tasks.yaml:2006-2012`): `422 task.list-invalid`. A list that does not exist or
 * that the caller does not see answers the same code, decided by the application.
 */
export class ListInvalidError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the list.
   *
   * @constructor
   */
  public constructor() {
    super('A task attached to a parent moves to the list of that parent.');
  }
  // #endregion
}
