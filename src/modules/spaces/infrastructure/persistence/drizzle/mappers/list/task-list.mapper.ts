import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import { LIST_ACTOR_TYPES } from '../../../../../domain/value-objects/list/list-actor.value-object.js';
import type { ListActor } from '../../../../../domain/value-objects/list/list-actor.value-object.js';
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
 * Function toArchivedBy
 *
 * @description
 * Reads who archived a list: `null` when either column is null, which `TaskList.restore` refuses
 * unless `archived_at` is null too (the check `lists_archived_check` keeps the three together).
 *
 * @param {TaskListRow} row - The row.
 * @returns {ListActor | null} The actor, or `null`.
 * @throws {Error} When the stored type is not one of `Actor`.
 */
function toArchivedBy(row: TaskListRow): ListActor | null {
  if (row.archivedByType === null || row.archivedById === null) {
    return null;
  }
  const type: ListActor['type'] | undefined = LIST_ACTOR_TYPES.find(
    (known: ListActor['type']): boolean => known === row.archivedByType,
  );
  if (type === undefined) {
    throw new Error('A stored actor type is not user, automation, git or system.');
  }
  return { type, id: row.archivedById };
}

/**
 * Function toTaskList
 *
 * @description
 * Maps a row to the list it stores, its switch "Accès de l’organisation" and its archive
 * included. The sprint dates stay `YYYY-MM-DD` strings.
 *
 * @param {TaskListRow} row - The row.
 * @returns {TaskList} The list.
 * @throws {Error} When the color, the icon or the actor type is outside its set.
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
    organizationAccess: row.organizationAccess,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
    archivedBy: toArchivedBy(row),
    restoredAt: row.restoredAt,
    version: row.version,
  });
}
