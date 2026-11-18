import { DomainError } from '../space/domain.error.js';

/**
 * Class InvalidListError
 *
 * @description
 * A new list, a change of a list or a stored list that breaks an invariant of `TaskList`,
 * `ListCreation` or `ListPatch` of `openapi/internal/task-service.yaml`, other than the order of
 * the sprint dates (`SprintDatesInvalidError`): for a request, what the contract answers with
 * `400 request.invalid`; for a stored state, a defect of the data.
 */
export class InvalidListError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the broken invariant.
   *
   * @param {string} invariant - Which invariant the list breaks, without any value.
   * @constructor
   */
  public constructor(invariant: string) {
    super(`The list breaks an invariant: ${invariant}.`);
  }
  // #endregion
}
