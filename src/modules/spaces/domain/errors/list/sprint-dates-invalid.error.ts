import { DomainError } from '../space/domain.error.js';

/**
 * Class SprintDatesInvalidError
 *
 * @description
 * A sprint whose last day is before its first ("La fin doit suivre le début."; "Sprints" of
 * `openapi/public/lists.yaml`, `422 list.sprint-dates-invalid` of
 * `openapi/internal/task-service.yaml`).
 */
export class SprintDatesInvalidError extends DomainError {
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
    super('The end of the sprint is before its start.');
  }
  // #endregion
}
