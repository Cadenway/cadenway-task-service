import { isClosedStatus } from '../../value-objects/task/status-category.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';

/**
 * Function isLate
 *
 * @description
 * Whether a task is late on the date of the caller: it is not closed and its due date is strictly
 * before `today` (`TaskCounts.late` of `openapi/internal/task-service.yaml:3339-3341`; "En retard"
 * of `openapi/public/tasks.yaml:1466-1482`). A task due today is not late, and a task without a due
 * date never is. The text order of `YYYY-MM-DD` is the date order.
 *
 * @param {StatusKey} status - The status of the task.
 * @param {string | null} dueDate - The due date, or `null` for none.
 * @param {string} today - The date of the caller.
 * @returns {boolean} Whether the task is late.
 */
export function isLate(status: StatusKey, dueDate: string | null, today: string): boolean {
  return !isClosedStatus(status) && dueDate !== null && dueDate < today;
}
