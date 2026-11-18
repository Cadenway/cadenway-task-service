import type { TaskListPage as TaskListPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { TaskListPage } from '../../../../application/projections/list/task-list-page.projection.js';
import { toListsCursor } from './list-cursor.mapper.js';
import { toTaskList } from './task-list.mapper.js';

/**
 * Function toTaskListPage
 *
 * @description
 * Maps one page of the lists of a space to the `TaskListPage` of the contract, with the cursor of
 * the next page, `null` on the last one.
 *
 * @param {TaskListPage} page - The page.
 * @param {string} spaceId - The space of the path, which the cursor names.
 * @returns {TaskListPageBody} The page of the contract.
 */
export function toTaskListPage(page: TaskListPage, spaceId: string): TaskListPageBody {
  return { items: page.items.map(toTaskList), nextCursor: toListsCursor(page.next, spaceId) };
}
