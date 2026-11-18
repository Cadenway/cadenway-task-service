import { DomainError } from '../task/domain.error.js';

/**
 * Class ParentInvalidError
 *
 * @description
 * A parent that is the task itself or one of its descendants (`openapi/public/tasks.yaml:439-440`;
 * `ParentInvalid` example, `openapi/public/tasks.yaml:2013-2021`): `422 task.parent-invalid` with
 * `details.parentKey`. An unknown parent, or one the caller does not see, answers the same code,
 * decided by the application.
 */
export class ParentInvalidError extends DomainError {
  // #region Properties
  /**
   * Property parentKey
   *
   * @description
   * The key of the refused parent, as `CAD-489`: `details.parentKey`.
   *
   * @type {string}
   * @readonly
   */
  public readonly parentKey: string;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the refused parent.
   *
   * @param {string} parentKey - The key of the parent asked for.
   * @constructor
   */
  public constructor(parentKey: string) {
    super(`The task ${parentKey} cannot become the parent: it is the task or one of its subtasks.`);
    this.parentKey = parentKey;
  }
  // #endregion
}
