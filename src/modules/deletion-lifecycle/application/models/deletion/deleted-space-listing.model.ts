/**
 * Interface DeletedSpaceListing
 *
 * @description
 * What the deletion job of a space reads of it, the space held `FOR SHARE` until the commit when it
 * exists: whether it is still deleted, live again (a restoration from the trash brought it back) or
 * gone (erased, or unknown), and its deleted lists not erased yet, by id.
 */
export interface DeletedSpaceListing {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The state of the space, read under its lock: `deleted` or `gone` drop its pending access
   * requests (the job exists only because the space was deleted, and an erased space is gone for
   * good); `live` keeps them.
   *
   * @type {'deleted' | 'live' | 'gone'}
   * @readonly
   */
  readonly space: 'deleted' | 'live' | 'gone';

  /**
   * Property listIds
   *
   * @description
   * The deleted lists of the space not erased yet, by id; each still goes to the trash when the
   * space was restored meanwhile, since its other lists stay deleted.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];
  // #endregion
}
