/**
 * Interface ResourceVersion
 *
 * @description
 * The version of a space or a list after a `DELETE …/grants/{userId}` (its `ETag`): the same
 * version when the person held no grant there.
 */
export interface ResourceVersion {
  // #region Properties
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
