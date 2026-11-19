import type { AccessRole } from './access-role.value-object.js';

/**
 * Interface ListGrants
 *
 * @description
 * The grants one member holds on a space and on one of its lists, the two grant sources of the
 * effective role of a list (decision 2 of P3b-1). `null` when the member holds none there.
 */
export interface ListGrants {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The role the grant of the space gives, which reaches every list of the space.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly space: AccessRole | null;

  /**
   * Property list
   *
   * @description
   * The role the grant of the list gives, on that list only.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly list: AccessRole | null;
  // #endregion
}
