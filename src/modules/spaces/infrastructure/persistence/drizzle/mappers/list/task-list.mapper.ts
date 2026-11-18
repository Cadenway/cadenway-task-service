import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Sprint } from '../../../../../domain/value-objects/list/sprint.value-object.js';
import type { taskLists } from '../../schemas/list/task-list.schema.js';
import { toLookColor, toLookIcon } from '../look/look.mapper.js';

/**
 * Type TaskListRow
 *
 * @description
 * A row of `lists`.
 *
 * @type {typeof taskLists.$inferSelect}
 */
export type TaskListRow = typeof taskLists.$inferSelect;

/**
 * Function toSprint
 *
 * @description
 * Reads the sprint of a row: `null` for a plain list. The checks of the table keep both dates
 * set or both null, and a goal on a sprint only.
 *
 * @param {TaskListRow} row - The row.
 * @returns {Sprint | null} The sprint, or `null`.
 */
function toSprint(row: TaskListRow): Sprint | null {
  if (row.sprintStartDate === null || row.sprintEndDate === null) {
    return null;
  }
  return { startDate: row.sprintStartDate, endDate: row.sprintEndDate, goal: row.sprintGoal };
}

/**
 * Function toTaskList
 *
 * @description
 * Maps a row to the list it stores. The sprint dates stay `YYYY-MM-DD` strings.
 *
 * @param {TaskListRow} row - The row.
 * @returns {TaskList} The list.
 * @throws {Error} When the color or icon is outside its set.
 */
export function toTaskList(row: TaskListRow): TaskList {
  return TaskList.restore({
    id: row.id,
    organizationId: row.organizationId,
    spaceId: row.spaceId,
    name: row.name,
    icon: toLookIcon(row.icon),
    color: toLookColor(row.color),
    sprint: toSprint(row),
    createdAt: row.createdAt,
    version: row.version,
  });
}
