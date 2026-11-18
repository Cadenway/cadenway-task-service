import type { TaskSummaryPage } from '@cadenway/contracts/types/internal/task-service';

import type { SubtaskPage } from '../../../../application/projections/subtask/subtask-page.projection.js';
import { toTaskSummary } from '../task/task-summary.mapper.js';
import { toSubtasksCursor } from './subtask-cursor.mapper.js';

/**
 * Function toSubtaskPage
 *
 * @description
 * Maps one page of the subtasks of a task to the `TaskSummaryPage` of the contract, with the
 * cursor of the next page, `null` on the last one, and the number of subtasks the task has.
 *
 * @param {SubtaskPage} page - The page.
 * @param {string} taskKey - The key of the parent, which the cursor names.
 * @returns {TaskSummaryPage} The page of the contract.
 */
export function toSubtaskPage(page: SubtaskPage, taskKey: string): TaskSummaryPage {
  return {
    items: page.items.map(toTaskSummary),
    nextCursor: toSubtasksCursor(page.next, taskKey),
    total: page.total,
  };
}
