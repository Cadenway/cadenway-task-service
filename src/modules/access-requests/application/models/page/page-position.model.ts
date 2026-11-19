/**
 * Interface PagePosition
 *
 * @description
 * Where a page of pending requests starts: after the request created at `createdAt` with the id
 * `id`, in the order of the listing, the most recent first, the id breaking the ties. The
 * presentation layer encodes it in the opaque cursor and checks both values when it decodes one.
 */
export interface PagePosition {
  // #region Properties
  /**
   * Property createdAt
   *
   * @description
   * Creation instant of the last request of the previous page.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property id
   *
   * @description
   * Id of the last request of the previous page.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}
