import type { StatusKey } from '../../value-objects/status/status-key.value-object.js';
import { DomainError } from './domain.error.js';

/**
 * Class SpaceStatusRequiredError
 *
 * @description
 * A change of a space that hides `todo` or `done`, which are always used ("Statuses" of
 * `openapi/public/spaces.yaml`; `422 space.status-required` with `details.status` in
 * `openapi/internal/task-service.yaml`).
 */
export class SpaceStatusRequiredError extends DomainError {
  // #region Properties
  /**
   * Property status
   *
   * @description
   * The status the change tried to hide, `details.status` of the answer.
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
   * Names the required status.
   *
   * @param {StatusKey} status - `todo` or `done`.
   * @constructor
   */
  public constructor(status: StatusKey) {
    super(`The status ${status} is always used and cannot be hidden.`);
    this.status = status;
  }
  // #endregion
}
