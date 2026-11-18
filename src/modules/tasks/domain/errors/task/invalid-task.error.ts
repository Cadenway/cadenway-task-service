import { DomainError } from './domain.error.js';

/**
 * Class InvalidTaskError
 *
 * @description
 * A new task, a change of a task or a stored task that breaks an invariant of `Task`,
 * `TaskCreation`, `TaskPatch`, `LabelName`, `ChecklistItem` or `ActivityEntry` of
 * `openapi/internal/task-service.yaml` (I:2135-2259, 2375-2721, 3465-3534) that the presentation
 * validators already refuse: for a request that reached the domain, what the contract answers with
 * `400 request.invalid`; for a stored state, a defect of the data.
 */
export class InvalidTaskError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the broken invariant.
   *
   * @param {string} invariant - Which invariant the task breaks, without any value.
   * @constructor
   */
  public constructor(invariant: string) {
    super(`The task breaks an invariant: ${invariant}.`);
  }
  // #endregion
}
