import type { StoredGrant } from '../../models/access/stored-grant.model.js';

/**
 * Interface GrantView
 *
 * @description
 * The grant a `PUT …/grants/{userId}` answers, with the version of the space or the list after
 * the change (its `ETag`): the same version when the person already held this role.
 */
export interface GrantView {
  // #region Properties
  /**
   * Property grant
   *
   * @description
   * The grant as stored.
   *
   * @type {StoredGrant}
   * @readonly
   */
  readonly grant: StoredGrant;

  /**
   * Property version
   *
   * @description
   * Version of the space or the list after the change.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;
  // #endregion
}
