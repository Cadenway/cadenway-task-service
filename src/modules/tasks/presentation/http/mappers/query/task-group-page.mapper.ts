import type { TaskGroupPage as TaskGroupPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { TaskGroupPage } from '../../../../application/projections/query/task-group-page.projection.js';
import type { TaskGroupView } from '../../../../application/projections/query/task-group.projection.js';

/**
 * Function toTaskGroupPage
 *
 * @description
 * Maps one page of the groups of a list to the `TaskGroupPage` of the contract: what the tasks are
 * grouped by, each group with its value and its count, the cursor of the next page, `null` on the
 * last one, and the number of tasks that match the filters, each counted once.
 *
 * @param {TaskGroupPage} page - The page.
 * @param {string | null} nextCursor - The cursor of the next page, built with the grouping and the
 * filters of the request.
 * @returns {TaskGroupPageBody} The page of the contract.
 */
export function toTaskGroupPage(page: TaskGroupPage, nextCursor: string | null): TaskGroupPageBody {
  return {
    groupBy: page.grouping,
    items: page.items.map((group: TaskGroupView) => ({ value: group.value, count: group.count })),
    nextCursor,
    total: page.total,
  };
}
