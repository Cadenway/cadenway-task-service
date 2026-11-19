/**
 * Interface PagePosition
 *
 * @description
 * Where a page of spaces or lists starts: after the row placed at `createdAt` with the id `id`,
 * the id as tie-breaker. Spaces are placed by their position in the sidebar
 * (`positionInSidebarOf`: their last restoration from the trash, or else their creation); the
 * lists of a space by their position there (`positionInSpaceOf`: their last restoration, or else
 * their creation). The presentation layer encodes it in the opaque cursor and checks the form of
 * both values when it decodes one.
 */
export interface PagePosition {
  // #region Properties
  /**
   * Property createdAt
   *
   * @description
   * The instant that places the last row of the previous page: the position of a space in the
   * sidebar, the position of a list in its space.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property id
   *
   * @description
   * Id of the last row of the previous page.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}
