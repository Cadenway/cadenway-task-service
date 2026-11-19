import type { ArchivePosition } from '../../../../application/models/archive/archive-position.model.js';
import type { InstantPosition } from '../page/page-cursor.mapper.js';
import { decodeInstantCursor, encodeInstantCursor } from '../page/page-cursor.mapper.js';

/**
 * Function archivesFilters
 *
 * @description
 * What defines a tab of the archives, fingerprinted into its cursor: the collection only (both
 * tabs take no filter), so a cursor of the lists never continues the tasks.
 *
 * @param {'archived-lists' | 'archived-tasks'} collection - The tab.
 * @returns {{ readonly collection: 'archived-lists' | 'archived-tasks' }} The filters.
 */
function archivesFilters(collection: 'archived-lists' | 'archived-tasks'): {
  readonly collection: 'archived-lists' | 'archived-tasks';
} {
  return { collection };
}

/**
 * Function toArchivesCursor
 *
 * @description
 * Encodes where the next page of a tab of the archives starts as the opaque cursor of the kit:
 * the archive instant and the id of the last row.
 *
 * @param {ArchivePosition | null} position - Where the next page starts, or `null`.
 * @param {'archived-lists' | 'archived-tasks'} collection - The tab.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toArchivesCursor(
  position: ArchivePosition | null,
  collection: 'archived-lists' | 'archived-tasks',
): string | null {
  return encodeInstantCursor(
    position === null ? null : { instant: position.archivedAt, id: position.id },
    archivesFilters(collection),
  );
}

/**
 * Function toArchivesPosition
 *
 * @description
 * Decodes the cursor of a previous page of a tab of the archives.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {'archived-lists' | 'archived-tasks'} collection - The tab.
 * @returns {ArchivePosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` with one issue on `cursor`
 * (`invalid_cursor`) for a cursor that is not one of this tab.
 */
export function toArchivesPosition(
  cursor: string | undefined,
  collection: 'archived-lists' | 'archived-tasks',
): ArchivePosition | null {
  const position: InstantPosition | null = decodeInstantCursor(cursor, archivesFilters(collection));
  return position === null ? null : { archivedAt: position.instant, id: position.id };
}
