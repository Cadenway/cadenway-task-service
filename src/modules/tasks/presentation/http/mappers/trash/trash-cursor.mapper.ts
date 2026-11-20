import type { TrashPosition } from '../../../../application/models/trash/trash-position.model.js';
import type { InstantPosition } from '../page/page-cursor.mapper.js';
import { decodeInstantCursor, encodeInstantCursor } from '../page/page-cursor.mapper.js';

/**
 * Constant TRASH_FILTERS
 *
 * @description
 * What the cursor of the trash is fingerprinted with: the collection, so that a cursor of another
 * page (the archives, a list) answers `400` here.
 *
 * @type {{ readonly collection: 'trash-entries' }}
 */
const TRASH_FILTERS: { readonly collection: 'trash-entries' } = { collection: 'trash-entries' };

/**
 * Function toTrashCursor
 *
 * @description
 * The `nextCursor` of a page of the trash: the deletion instant and the id of its last entry, in
 * the order of the page (`trashed_at desc, id desc`).
 *
 * @param {TrashPosition | null} position - The last entry of the page, `null` on the last page.
 * @returns {string | null} The cursor, `null` on the last page.
 */
export function toTrashCursor(position: TrashPosition | null): string | null {
  return encodeInstantCursor(
    position === null ? null : { instant: position.trashedAt, id: position.id },
    TRASH_FILTERS,
  );
}

/**
 * Function toTrashPosition
 *
 * @description
 * Reads the `cursor` of a request of the trash.
 *
 * @param {string | undefined} cursor - The cursor, `undefined` for the first page.
 * @returns {TrashPosition | null} The position, `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` with the issue `invalid_cursor` for a cursor
 * that is not one of this collection.
 */
export function toTrashPosition(cursor: string | undefined): TrashPosition | null {
  const position: InstantPosition | null = decodeInstantCursor(cursor, TRASH_FILTERS);
  return position === null ? null : { trashedAt: position.instant, id: position.id };
}
