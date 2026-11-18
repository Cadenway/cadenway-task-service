import { DomainError } from './domain.error.js';

/**
 * Class StartDateInvalidError
 *
 * @description
 * A start date without a due date or after it (`openapi/public/tasks.yaml:117` and 430-433;
 * `StartDateInvalid` example, `openapi/public/tasks.yaml:1999-2005`), or a due-date shift that
 * would move the start before 0001-01-01 (open question 7 of the design):
 * `422 task.start-date-invalid`.
 */
export class StartDateInvalidError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the dates without quoting them.
   *
   * @constructor
   */
  public constructor() {
    super('The start date needs a due date and is on or before it.');
  }
  // #endregion
}
