import type { AccessRole } from './access-role.value-object.js';

/**
 * Interface GrantEntry
 *
 * @description
 * The grant of one person on a space or a list, as the access events carry it (`grants` of
 * `space.access-changed.v1` and `list.access-changed.v1`): the account and its role.
 */
export interface GrantEntry {
  // #region Properties
  /**
   * Property userId
   *
   * @description
   * Account of the person given access.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property role
   *
   * @description
   * The role the grant gives.
   *
   * @type {AccessRole}
   * @readonly
   */
  readonly role: AccessRole;
  // #endregion
}
