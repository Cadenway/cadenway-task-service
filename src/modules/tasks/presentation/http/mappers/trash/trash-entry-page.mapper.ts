import type { TrashEntryPage as TrashEntryPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { TrashEntryPage } from '../../../../application/projections/trash/trash-entry-page.projection.js';
import { toTrashCursor } from './trash-cursor.mapper.js';
import { toTrashEntry } from './trash-entry.mapper.js';

/**
 * Function toTrashEntryPage
 *
 * @description
 * Maps a page of the trash to `TrashEntryPage` of the contract, with the cursor of the next page
 * and the total.
 *
 * @param {TrashEntryPage} page - The page.
 * @returns {TrashEntryPageBody} The body.
 */
export function toTrashEntryPage(page: TrashEntryPage): TrashEntryPageBody {
  return {
    items: page.items.map(toTrashEntry),
    nextCursor: toTrashCursor(page.next),
    total: page.total,
  };
}
