/**
 * Interface ListDeletedSpaceListsOutput
 *
 * @description
 * Where a space stands, held `FOR SHARE` until the end of the transaction of the caller, and its
 * deleted lists that are not erased yet.
 */
export interface ListDeletedSpaceListsOutput {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The space on the locked row: `deleted` for a tombstone, `live` for a space restored from the
   * trash meanwhile, `gone` for an erased or unknown one. The deletion job drops the access
   * requests of the space itself when it is `deleted` or `gone`.
   *
   * @type {'deleted' | 'live' | 'gone'}
   * @readonly
   */
  readonly space: 'deleted' | 'live' | 'gone';

  /**
   * Property listIds
   *
   * @description
   * The ids of the deleted lists of the space, in id order, whether the space is still deleted or
   * not (a restoration brings back one list only); none for a space that is `gone`.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];
  // #endregion
}
