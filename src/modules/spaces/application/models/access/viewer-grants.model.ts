import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface ViewerGrants
 *
 * @description
 * The grants one member holds around a space, read in one statement (decision 2 of P3b-1): the
 * grant of the space, the grant of one of its lists, and whether they hold a grant of any list of
 * it, which shows them the space with `callerRole: null`.
 */
export interface ViewerGrants {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The role the grant of the space gives, `null` without one.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly space: AccessRole | null;

  /**
   * Property list
   *
   * @description
   * The role the grant of the list asked for gives, `null` without one or when no list was asked.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly list: AccessRole | null;

  /**
   * Property anyList
   *
   * @description
   * Whether the member holds a grant of at least one list of the space.
   *
   * @type {boolean}
   * @readonly
   */
  readonly anyList: boolean;
  // #endregion
}
