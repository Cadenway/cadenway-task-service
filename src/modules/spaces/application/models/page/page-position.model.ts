/**
 * Interface PagePosition
 *
 * @description
 * Where a page of spaces or lists starts: after the row created at `createdAt` with the id `id`,
 * the order of their creation with the id as tie-breaker. The presentation layer encodes it in the
 * opaque cursor and checks the form of both values when it decodes one.
 */
export interface PagePosition {
  // #region Properties
  /**
   * Property createdAt
   *
   * @description
   * Creation instant of the last row of the previous page.
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
