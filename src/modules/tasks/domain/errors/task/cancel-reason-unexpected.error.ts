import { DomainError } from './domain.error.js';

/**
 * Class CancelReasonUnexpectedError
 *
 * @description
 * A cancel reason or a cancel note for a task whose status is not `cancelled` after the request
 * (`openapi/public/tasks.yaml:113-114` and 427-428; `CancelReasonInput`,
 * `openapi/internal/task-service.yaml:3486-3490`): `422 task.cancel-reason-unexpected`. `null`
 * for either is "none" and is accepted (open question 4 of the design).
 */
export class CancelReasonUnexpectedError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the reason or the note.
   *
   * @constructor
   */
  public constructor() {
    super('Only a cancelled task takes a cancel reason or a cancel note.');
  }
  // #endregion
}
