import type { TaskSummaryPage as TaskSummaryPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { TaskSummaryPage } from '../../../../application/projections/query/task-summary-page.projection.js';
import { toTaskSummary } from '../task/task-summary.mapper.js';

/**
 * Function toTaskSummaryPage
 *
 * @description
 * Maps one page of the tasks of a list to the `TaskSummaryPage` of the contract, with the cursor of
 * the next page, `null` on the last one, and the number of tasks that match the filters.
 *
 * @param {TaskSummaryPage} page - The page.
 * @param {string | null} nextCursor - The cursor of the next page, built with the filters of the
 * request.
 * @returns {TaskSummaryPageBody} The page of the contract.
 */
export function toTaskSummaryPage(
  page: TaskSummaryPage,
  nextCursor: string | null,
): TaskSummaryPageBody {
  return { items: page.items.map(toTaskSummary), nextCursor, total: page.total };
}
