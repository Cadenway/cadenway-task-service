import { DomainError } from './domain.error.js';

/**
 * Class SpaceVisibilityForbiddenError
 *
 * @description
 * A change of the visibility of a space by a member who is neither its owner nor the owner or an
 * admin of the organization ("Who changes what" of `openapi/public/spaces.yaml`,
 * `403 space.visibility-forbidden`; decision 3 of the P3a plan).
 */
export class SpaceVisibilityForbiddenError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the change without naming the member.
   *
   * @constructor
   */
  public constructor() {
    super(
      'Only the owner of the space, or the owner or an admin of the organization, changes its visibility.',
    );
  }
  // #endregion
}
