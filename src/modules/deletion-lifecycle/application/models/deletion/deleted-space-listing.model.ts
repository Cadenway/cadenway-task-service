/**
 * Interface DeletedSpaceListing
 *
 * @description
 * What the deletion job of a space reads of it, the space held `FOR SHARE` until the commit:
 * whether it is still deleted (a restoration from the trash may have brought it back), and its
 * deleted lists not erased yet, by id.
 */
export interface DeletedSpaceListing {
  // #region Properties
  /**
   * Property spaceDeleted
   *
   * @description
   * Whether the space is still deleted, read under its lock: only then are its pending access
   * requests dropped.
   *
   * @type {boolean}
   * @readonly
   */
  readonly spaceDeleted: boolean;

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
