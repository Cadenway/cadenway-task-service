import { DomainError } from './domain.error.js';

/**
 * Class CancelReasonRequiredError
 *
 * @description
 * A task that becomes or stays `cancelled` without a reason ("Motif d’annulation";
 * `openapi/public/tasks.yaml:24-25`, 112-113 and 425-426; `TaskPatch.cancelReason`,
 * `openapi/internal/task-service.yaml:2543-2549`): `422 task.cancel-reason-required`.
 */
export class CancelReasonRequiredError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the cancellation without a reason.
   *
   * @constructor
   */
  public constructor() {
    super('A cancelled task needs a cancel reason.');
  }
  // #endregion
}
