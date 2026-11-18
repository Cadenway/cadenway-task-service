import type { PagePosition } from './page-position.model.js';

/**
 * Interface Slice
 *
 * @description
 * A page cut out of the rows a repository returned: the rows of the page and where the next page
 * starts.
 */
export interface Slice<TRow extends PagePosition> {
  // #region Properties
  /**
   * Property items
   *
   * @description
   * The rows of the page, at most `limit`.
   *
   * @type {readonly TRow[]}
   * @readonly
   */
  readonly items: readonly TRow[];

  /**
   * Property next
   *
   * @description
   * The position of the last row of the page when more rows follow, `null` on the last page.
   *
   * @type {PagePosition | null}
   * @readonly
   */
  readonly next: PagePosition | null;
  // #endregion
}
