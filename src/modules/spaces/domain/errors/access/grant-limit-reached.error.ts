import { DomainError } from '../space/domain.error.js';

/**
 * Class GrantLimitReachedError
 *
 * @description
 * A new grant on a space or a list that already holds 200 (decision 11 of P3b-1, a limit the
 * mockup does not set, `422 access.grant-limit-reached`). Changing the role of a person who
 * already holds a grant is never refused by the limit.
 */
export class GrantLimitReachedError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the new grant.
   *
   * @constructor
   */
  public constructor() {
    super('A space or a list holds 200 grants at most.');
  }
  // #endregion
}
