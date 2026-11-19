import { DomainError } from '../space/domain.error.js';

/**
 * Class GranteeInvalidError
 *
 * @description
 * A grant for an account the copy of the memberships does not hold as a current member or guest
 * of the organization (decision 1 of P3b-1, `422 access.grantee-invalid`): someone from outside is
 * first invited as a guest, then given a grant once they joined.
 */
export class GranteeInvalidError extends DomainError {
  // #region Properties
  /**
   * Property userId
   *
   * @description
   * The account that cannot receive the grant, for `details.userId`.
   *
   * @type {string}
   * @readonly
   */
  public readonly userId: string;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the grant for the account.
   *
   * @param {string} userId - The account.
   * @constructor
   */
  public constructor(userId: string) {
    super('A grant goes to a current member or guest of the organization.');
    this.userId = userId;
  }
  // #endregion
}
