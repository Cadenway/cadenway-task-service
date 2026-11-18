import type { ActivityPage as ActivityPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { ActivityPage } from '../../../../application/projections/activity/activity-page.projection.js';
import { toActivityEntry } from './activity-entry.mapper.js';

/**
 * Function toActivityPage
 *
 * @description
 * Maps one page of the activity log, most recent first, to the `ActivityPage` of the contract with
 * the cursor of the next page, `null` on the last one, and the number of entries that match the
 * filters of the request.
 *
 * @param {ActivityPage} page - The page.
 * @param {string | null} nextCursor - The cursor of the next page, built with the filters of the
 * request.
 * @returns {ActivityPageBody} The page of the contract.
 */
export function toActivityPage(page: ActivityPage, nextCursor: string | null): ActivityPageBody {
  return { items: page.items.map(toActivityEntry), nextCursor, total: page.total };
}
