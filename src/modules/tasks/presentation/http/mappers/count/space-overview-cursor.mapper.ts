import type { ListPosition } from '../../../../application/models/placement/list-position.model.js';
import { decodeInstantCursor, encodeInstantCursor } from '../page/page-cursor.mapper.js';
import type { InstantPosition } from '../page/page-cursor.mapper.js';

/**
 * Function spaceOverviewFilters
 *
 * @description
 * What defines the collection of the lists of the overview of a space, fingerprinted into its
 * cursor: the collection and the space (lower-cased, since the path accepts a UUID in either
 * case). `today` is not part of it: it changes the counters, not the lists.
 *
 * @param {string} spaceId - The space of the path.
 * @returns {{ readonly collection: 'space-overview'; readonly spaceId: string }} The filters.
 */
function spaceOverviewFilters(spaceId: string): {
  readonly collection: 'space-overview';
  readonly spaceId: string;
} {
  return { collection: 'space-overview', spaceId: spaceId.toLowerCase() };
}

/**
 * Function toSpaceOverviewCursor
 *
 * @description
 * Encodes where the next page of the overview of a space starts as the opaque cursor of the kit:
 * the position of the last list of the page in the order of the sidebar (its restoration, else
 * its creation) and its id.
 *
 * @param {ListPosition | null} position - Where the next page starts, or `null`.
 * @param {string} spaceId - The space of the path.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toSpaceOverviewCursor(
  position: ListPosition | null,
  spaceId: string,
): string | null {
  return encodeInstantCursor(
    position === null ? null : { instant: position.position, id: position.id },
    spaceOverviewFilters(spaceId),
  );
}

/**
 * Function toSpaceOverviewPosition
 *
 * @description
 * Decodes the cursor of a previous page of the overview of a space.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string} spaceId - The space of the path.
 * @returns {ListPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this space.
 */
export function toSpaceOverviewPosition(
  cursor: string | undefined,
  spaceId: string,
): ListPosition | null {
  const position: InstantPosition | null = decodeInstantCursor(
    cursor,
    spaceOverviewFilters(spaceId),
  );
  return position === null ? null : { position: position.instant, id: position.id };
}
