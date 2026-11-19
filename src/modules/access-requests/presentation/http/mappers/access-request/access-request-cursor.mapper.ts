import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import { toCursor, toPosition } from '../page/page-cursor.mapper.js';

/**
 * Function accessRequestsFilters
 *
 * @description
 * What defines the collection of the pending requests, fingerprinted into its cursor: the
 * collection and the two filters, lower-cased since the query accepts a UUID in either case. The
 * organization and the actor come from the internal token, so a cursor never widens them.
 *
 * @param {string | null} spaceId - The `spaceId` filter, `null` for none.
 * @param {string | null} listId - The `listId` filter, `null` for none.
 * @returns {object} The filters.
 */
function accessRequestsFilters(
  spaceId: string | null,
  listId: string | null,
): {
  readonly collection: 'access-requests';
  readonly spaceId: string | null;
  readonly listId: string | null;
} {
  return {
    collection: 'access-requests',
    spaceId: spaceId === null ? null : spaceId.toLowerCase(),
    listId: listId === null ? null : listId.toLowerCase(),
  };
}

/**
 * Function toAccessRequestsCursor
 *
 * @description
 * Encodes where the next page of pending requests starts as the opaque cursor of the kit.
 *
 * @param {PagePosition | null} position - Where the next page starts, or `null`.
 * @param {string | null} spaceId - The `spaceId` filter, `null` for none.
 * @param {string | null} listId - The `listId` filter, `null` for none.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toAccessRequestsCursor(
  position: PagePosition | null,
  spaceId: string | null,
  listId: string | null,
): string | null {
  return toCursor(position, accessRequestsFilters(spaceId, listId));
}

/**
 * Function toAccessRequestsPosition
 *
 * @description
 * Decodes the cursor of a previous page of pending requests, with the same filters.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string | null} spaceId - The `spaceId` filter, `null` for none.
 * @param {string | null} listId - The `listId` filter, `null` for none.
 * @returns {PagePosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
 * collection.
 */
export function toAccessRequestsPosition(
  cursor: string | undefined,
  spaceId: string | null,
  listId: string | null,
): PagePosition | null {
  return toPosition(cursor, accessRequestsFilters(spaceId, listId));
}
