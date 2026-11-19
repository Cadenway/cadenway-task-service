import type { PagePosition } from '../../models/page/page-position.model.js';
import type { StoredGrant } from '../../models/access/stored-grant.model.js';
import type { GrantPage } from '../../projections/access/grant-page.projection.js';

/**
 * Class GrantPager
 *
 * @description
 * Cuts a page out of every grant of a space or a list, read in one statement (200 at most) in the
 * order `(createdAt, userId)`: the page starts after the position of the cursor, the person who
 * was first given access at `createdAt` with the account `id`, and `total` counts every grant. The
 * accounts are lower-case UUIDs, whose text order is the order of PostgreSQL.
 */
export class GrantPager {
  // #region Methods
  /**
   * Method page
   *
   * @description
   * Keeps the grants after `after`, at most `limit`, and where the next page starts.
   *
   * @param {readonly StoredGrant[]} grants - Every grant, in the order `(createdAt, userId)`.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - The size of the page, at least 1.
   * @returns {GrantPage} The page.
   */
  public page(
    grants: readonly StoredGrant[],
    after: PagePosition | null,
    limit: number,
  ): GrantPage {
    const rest: readonly StoredGrant[] =
      after === null
        ? grants
        : grants.filter(
            (grant: StoredGrant): boolean =>
              grant.createdAt.getTime() > after.createdAt.getTime() ||
              (grant.createdAt.getTime() === after.createdAt.getTime() && grant.userId > after.id),
          );
    const items: readonly StoredGrant[] = rest.slice(0, limit);
    const last: StoredGrant | undefined = items.at(-1);
    return {
      items,
      next:
        rest.length > limit && last !== undefined
          ? { createdAt: last.createdAt, id: last.userId }
          : null,
      total: grants.length,
    };
  }
  // #endregion
}
