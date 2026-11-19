import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import { toCursor, toPosition } from '../page/page-cursor.mapper.js';

/**
 * Function grantsFilters
 *
 * @description
 * What defines a collection of grants, fingerprinted into its cursor: the kind of resource and
 * its id, so a cursor of one space or list never continues another. The id is lower-cased since
 * the path accepts a UUID in either case.
 *
 * @param {'space-grants' | 'list-grants'} collection - The grants of a space or of a list.
 * @param {string} resourceId - The space or the list of the path.
 * @returns {{ readonly collection: 'space-grants' | 'list-grants'; readonly resourceId: string }}
 * The filters.
 */
function grantsFilters(
  collection: 'space-grants' | 'list-grants',
  resourceId: string,
): { readonly collection: 'space-grants' | 'list-grants'; readonly resourceId: string } {
  return { collection, resourceId: resourceId.toLowerCase() };
}

/**
 * Function toGrantsCursor
 *
 * @description
 * Encodes where the next page of the grants of a space or a list starts (when the last person of
 * the page was first given access, and their account) as the opaque cursor of the kit.
 *
 * @param {PagePosition | null} position - Where the next page starts, or `null`.
 * @param {'space-grants' | 'list-grants'} collection - The grants of a space or of a list.
 * @param {string} resourceId - The space or the list of the path.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toGrantsCursor(
  position: PagePosition | null,
  collection: 'space-grants' | 'list-grants',
  resourceId: string,
): string | null {
  return toCursor(position, grantsFilters(collection, resourceId));
}

/**
 * Function toGrantsPosition
 *
 * @description
 * Decodes the cursor of a previous page of the grants of a space or a list.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {'space-grants' | 'list-grants'} collection - The grants of a space or of a list.
 * @param {string} resourceId - The space or the list of the path.
 * @returns {PagePosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
 * collection.
 */
export function toGrantsPosition(
  cursor: string | undefined,
  collection: 'space-grants' | 'list-grants',
  resourceId: string,
): PagePosition | null {
  return toPosition(cursor, grantsFilters(collection, resourceId));
}
