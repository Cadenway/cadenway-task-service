/**
 * Interface ListDeletedSpaceListsOutput
 *
 * @description
 * Whether a space is still deleted, held `FOR SHARE` until the end of the transaction of the
 * caller, and its deleted lists that are not erased yet.
 */
export interface ListDeletedSpaceListsOutput {
  // #region Properties
  /**
   * Property spaceDeleted
   *
   * @description
   * Whether the space is a tombstone on the locked row: `false` for a space restored from the trash
   * meanwhile, an unknown or an erased one. The deletion job drops the access requests of the space
   * itself only when it is `true`.
   *
   * @type {boolean}
   * @readonly
   */
  readonly spaceDeleted: boolean;

  /**
   * Property listIds
   *
   * @description
   * The ids of the deleted lists of the space, in id order, whether the space is still deleted or
   * not (a restoration brings back one list only); none for an unknown or erased space.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];
  // #endregion
}
