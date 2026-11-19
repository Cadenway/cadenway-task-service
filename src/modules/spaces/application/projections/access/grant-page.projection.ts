import type { PagePosition } from '../../models/page/page-position.model.js';
import type { StoredGrant } from '../../models/access/stored-grant.model.js';

/**
 * Interface GrantPage
 *
 * @description
 * One page of the grants of a space or a list, in the order they were first given (`GrantPage`
 * of `openapi/internal/task-service.yaml`). The position of a page is the instant the last person
 * of the previous page was first given access and their account, in `createdAt` and `id`.
 */
export interface GrantPage {
  // #region Properties
  /**
   * Property items
   *
   * @description
   * The grants of the page.
   *
   * @type {readonly StoredGrant[]}
   * @readonly
   */
  readonly items: readonly StoredGrant[];

  /**
   * Property next
   *
   * @description
   * Where the next page starts, `null` on the last page.
   *
   * @type {PagePosition | null}
   * @readonly
   */
  readonly next: PagePosition | null;

  /**
   * Property total
   *
   * @description
   * How many grants the space or the list holds, on every page.
   *
   * @type {number}
   * @readonly
   */
  readonly total: number;
  // #endregion
}
