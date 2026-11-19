import type { PagePosition } from '../../../../models/page/page-position.model.js';

/**
 * Interface ListAccessRequestsInput
 *
 * @description
 * A page of the pending requests the actor answers (`GET /internal/v1/access-requests`), with its
 * filters.
 */
export interface ListAccessRequestsInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account that reads.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property spaceId
   *
   * @description
   * Keeps the requests of this space, its lists and their tasks, in lower case; `null` for no
   * filter.
   *
   * @type {string | null}
   * @readonly
   */
  readonly spaceId: string | null;

  /**
   * Property listId
   *
   * @description
   * Keeps the requests of this list and its tasks, in lower case; `null` for no filter.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;

  /**
   * Property after
   *
   * @description
   * Where the page starts, `null` for the first page.
   *
   * @type {PagePosition | null}
   * @readonly
   */
  readonly after: PagePosition | null;

  /**
   * Property limit
   *
   * @description
   * The page size, 1 to 100.
   *
   * @type {number}
   * @readonly
   */
  readonly limit: number;
  // #endregion
}
