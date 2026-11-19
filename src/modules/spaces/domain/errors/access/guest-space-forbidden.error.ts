import { DomainError } from '../space/domain.error.js';

/**
 * Class GuestSpaceForbiddenError
 *
 * @description
 * A grant of a space for a guest of the organization (decision 1 of P3b-1, "Elle ne verra que
 * cette liste", `422 access.guest-space-forbidden`): a guest holds grants of lists only.
 */
export class GuestSpaceForbiddenError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the grant without naming the guest.
   *
   * @constructor
   */
  public constructor() {
    super('A guest receives grants of lists only.');
  }
  // #endregion
}
