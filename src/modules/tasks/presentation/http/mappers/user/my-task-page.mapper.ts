import type { MyTaskPage as MyTaskPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { MyTaskPage } from '../../../../application/projections/user/my-task-page.projection.js';
import { toTaskSummary } from '../task/task-summary.mapper.js';

/**
 * Function toMyTaskPage
 *
 * @description
 * Maps one page of "Mes tâches" to the `MyTaskPage` of the contract: the tasks assigned to the
 * actor, subtasks included, the cursor of the next page, `null` on the last one, and the number of
 * tasks of each tab, which is the same on every page.
 *
 * @param {MyTaskPage} page - The page.
 * @param {string | null} nextCursor - The cursor of the next page, built with the account and the
 * tab of the request.
 * @returns {MyTaskPageBody} The page of the contract.
 */
export function toMyTaskPage(page: MyTaskPage, nextCursor: string | null): MyTaskPageBody {
  return {
    items: page.items.map(toTaskSummary),
    nextCursor,
    counts: { open: page.counts.open, closed: page.counts.closed },
  };
}
