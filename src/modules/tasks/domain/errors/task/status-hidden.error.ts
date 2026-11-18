import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import { DomainError } from './domain.error.js';

/**
 * Class StatusHiddenError
 *
 * @description
 * A new status that the space the task is in after the change no longer uses ("Statuses" of
 * `openapi/public/tasks.yaml:20-26`, 111-112, 424-425 and 445-447): `422 task.status-hidden` with
 * `details.status` (`StatusHidden` example, `openapi/public/tasks.yaml:1966-1974`). A status the
 * task already has is never refused.
 */
export class StatusHiddenError extends DomainError {
  // #region Properties
  /**
   * Property status
   *
   * @description
   * The refused status, `details.status` of the answer.
   *
   * @type {StatusKey}
   * @readonly
   */
  public readonly status: StatusKey;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the hidden status.
   *
   * @param {StatusKey} status - The status the space no longer uses.
   * @constructor
   */
  public constructor(status: StatusKey) {
    super(`The status ${status} is no longer used in this space.`);
    this.status = status;
  }
  // #endregion
}
