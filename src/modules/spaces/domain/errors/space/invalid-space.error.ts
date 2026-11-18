import { DomainError } from './domain.error.js';

/**
 * Class InvalidSpaceError
 *
 * @description
 * A new space, a change of a space or a stored space that breaks an invariant of `Space`,
 * `SpaceCreation` or `SpacePatch` of `openapi/internal/task-service.yaml`: for a request, what the
 * contract answers with `400 request.invalid`; for a stored state, a defect of the data.
 */
export class InvalidSpaceError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the broken invariant.
   *
   * @param {string} invariant - Which invariant the space breaks, without any value.
   * @constructor
   */
  public constructor(invariant: string) {
    super(`The space breaks an invariant: ${invariant}.`);
  }
  // #endregion
}
