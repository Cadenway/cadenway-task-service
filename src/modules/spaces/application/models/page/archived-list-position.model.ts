/**
 * Interface ArchivedListPosition
 *
 * @description
 * Where a page of the archived lists starts ("Archives", tab "Listes"): after the list archived at
 * `archivedAt` with the id `id`, in the order `(archived_at desc, id desc)`, the most recently
 * archived first. The caller encodes it in its own opaque cursor.
 */
export interface ArchivedListPosition {
  // #region Properties
  /**
   * Property archivedAt
   *
   * @description
   * When the last list of the previous page was archived.
   *
   * @type {Date}
   * @readonly
   */
  readonly archivedAt: Date;

  /**
   * Property id
   *
   * @description
   * Id of the last list of the previous page.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}
