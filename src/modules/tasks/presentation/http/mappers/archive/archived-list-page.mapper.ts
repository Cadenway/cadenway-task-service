import type { ArchivedListPage as ArchivedListPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { ArchivedListPage } from '../../../../application/projections/archive/archived-list-page.projection.js';
import type { ArchivedListView } from '../../../../application/projections/archive/archived-list.projection.js';
import { toPlacedList } from '../placement/placed-list.mapper.js';
import { toArchivesCursor } from './archive-cursor.mapper.js';

/**
 * Function toArchivedListPage
 *
 * @description
 * Maps one page of the archived lists to the `ArchivedListPage` of
 * `openapi/internal/task-service.yaml`: each list as a whole `TaskList` (its role, its switch and
 * its archive) with the count of its live top-level tasks, the cursor of the next page, `null` on
 * the last one, and the total.
 *
 * @param {ArchivedListPage} page - The page.
 * @returns {ArchivedListPageBody} The page of the contract.
 */
export function toArchivedListPage(page: ArchivedListPage): ArchivedListPageBody {
  return {
    items: page.items.map((item: ArchivedListView) => ({
      list: toPlacedList(item.list),
      taskCount: item.taskCount,
    })),
    nextCursor: toArchivesCursor(page.next, 'archived-lists'),
    total: page.total,
  };
}
