import type { TaskPosition } from '../../../../application/models/query/task-position.model.js';
import type { MyTaskState } from '../../../../application/models/user/my-task-state.model.js';
import { decodeTaskPosition, encodeTaskPosition } from '../page/task-position-cursor.mapper.js';

/**
 * Function myTasksFilters
 *
 * @description
 * What defines the collection of "Mes tâches", fingerprinted into its cursor: the collection, the
 * account (lower-cased, since the path accepts a UUID in either case) and the tab.
 *
 * @param {string} userId - The account of the path.
 * @param {MyTaskState} state - The tab, `open` or `closed`.
 * @returns {object} The filters.
 */
function myTasksFilters(userId: string, state: MyTaskState): object {
  return { collection: 'my-tasks', userId: userId.toLowerCase(), state };
}

/**
 * Function toMyTaskCursor
 *
 * @description
 * Encodes where the next page of "Mes tâches" starts as the opaque cursor of the kit: `sort` is
 * `[dueDate | null, createdAt]`, the order of the page (due date, undated last, then creation).
 *
 * @param {TaskPosition | null} position - Where the next page starts, or `null`.
 * @param {string} userId - The account of the path.
 * @param {MyTaskState} state - The tab, `open` or `closed`.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toMyTaskCursor(
  position: TaskPosition | null,
  userId: string,
  state: MyTaskState,
): string | null {
  return encodeTaskPosition(position, 'due', myTasksFilters(userId, state));
}

/**
 * Function toMyTaskPosition
 *
 * @description
 * Decodes the cursor of a previous page of "Mes tâches", of the same account and tab.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string} userId - The account of the path.
 * @param {MyTaskState} state - The tab, `open` or `closed`.
 * @returns {TaskPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
 * collection, or whose date is not a date PostgreSQL stores.
 */
export function toMyTaskPosition(
  cursor: string | undefined,
  userId: string,
  state: MyTaskState,
): TaskPosition | null {
  return decodeTaskPosition(cursor, 'due', myTasksFilters(userId, state));
}
