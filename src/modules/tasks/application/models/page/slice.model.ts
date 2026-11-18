/**
 * Interface Slice
 *
 * @description
 * A page cut out of the rows a repository returned: the rows of the page and where the next page
 * starts.
 */
export interface Slice<TRow, TPosition> {
  // #region Properties
  /** The rows of the page, at most `limit`. */
  readonly items: readonly TRow[];

  /** The position of the last row of the page when more rows follow, `null` on the last page. */
  readonly next: TPosition | null;
  // #endregion
}
