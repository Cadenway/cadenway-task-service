import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import { toCursor, toPosition } from '../page/page-cursor.mapper.js';

/**
 * Constant SPACES_FILTERS
 *
 * @description
 * What defines the collection of spaces, fingerprinted into its cursor: the collection only, since
 * the organization and the actor come from the internal token and the cursor never widens them.
 *
 * @type {{ readonly collection: 'spaces' }}
 */
const SPACES_FILTERS: { readonly collection: 'spaces' } = { collection: 'spaces' };

/**
 * Function toSpacesCursor
 *
 * @description
 * Encodes where the next page of spaces starts as the opaque cursor of the kit.
 *
 * @param {PagePosition | null} position - Where the next page starts, or `null`.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toSpacesCursor(position: PagePosition | null): string | null {
  return toCursor(position, SPACES_FILTERS);
}

/**
 * Function toSpacesPosition
 *
 * @description
 * Decodes the cursor of a previous page of spaces.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @returns {PagePosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of the spaces.
 */
export function toSpacesPosition(cursor: string | undefined): PagePosition | null {
  return toPosition(cursor, SPACES_FILTERS);
}
