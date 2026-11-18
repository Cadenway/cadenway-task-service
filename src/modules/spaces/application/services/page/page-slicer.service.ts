import type { PagePosition } from '../../models/page/page-position.model.js';
import type { Slice } from '../../models/page/slice.model.js';

/**
 * Class PageSlicer
 *
 * @description
 * Cuts a page out of rows read with one row more than the page size: the extra row proves that a
 * next page exists without a count query.
 */
export class PageSlicer {
  // #region Methods
  /**
   * Method slice
   *
   * @description
   * Keeps the first `limit` rows and, when the repository returned more, the position of the last
   * kept row as the start of the next page.
   *
   * @param {readonly TRow[]} rows - The rows read, at most `limit + 1`, in the order of the page.
   * @param {number} limit - The size of the page.
   * @returns {Slice<TRow>} The page.
   */
  public slice<TRow extends PagePosition>(rows: readonly TRow[], limit: number): Slice<TRow> {
    const items: readonly TRow[] = rows.slice(0, limit);
    const last: TRow | undefined = items.at(-1);
    if (rows.length <= limit || last === undefined) {
      return { items, next: null };
    }
    return { items, next: { createdAt: last.createdAt, id: last.id } };
  }
  // #endregion
}
