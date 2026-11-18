import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import { toCursor, toPosition } from '../page/page-cursor.mapper.js';

/**
 * Function listsFilters
 *
 * @description
 * What defines the collection of the lists of a space, fingerprinted into its cursor: the
 * collection and the space, so a cursor of one space never continues another. The id is lower-cased
 * since the path accepts a UUID in either case.
 *
 * @param {string} spaceId - The space of the path.
 * @returns {{ readonly collection: 'lists'; readonly spaceId: string }} The filters.
 */
function listsFilters(spaceId: string): { readonly collection: 'lists'; readonly spaceId: string } {
  return { collection: 'lists', spaceId: spaceId.toLowerCase() };
}

/**
 * Function toListsCursor
 *
 * @description
 * Encodes where the next page of the lists of a space starts as the opaque cursor of the kit.
 *
 * @param {PagePosition | null} position - Where the next page starts, or `null`.
 * @param {string} spaceId - The space of the path.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toListsCursor(position: PagePosition | null, spaceId: string): string | null {
  return toCursor(position, listsFilters(spaceId));
}

/**
 * Function toListsPosition
 *
 * @description
 * Decodes the cursor of a previous page of the lists of a space.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string} spaceId - The space of the path.
 * @returns {PagePosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this space.
 */
export function toListsPosition(cursor: string | undefined, spaceId: string): PagePosition | null {
  return toPosition(cursor, listsFilters(spaceId));
}
