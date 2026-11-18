import type { TaskFilterInput } from '../../../../application/models/query/task-filter-input.model.js';
import type { TaskPosition } from '../../../../application/models/query/task-position.model.js';
import type { ListTasksQuery } from '../../dto/input/task/list-tasks-query.dto.js';
import { decodeTaskPosition, encodeTaskPosition } from '../page/task-position-cursor.mapper.js';
import type { TaskSortKind } from '../page/task-position-cursor.mapper.js';
import { taskFilterFingerprint } from './task-filter.mapper.js';

/**
 * Function listTasksFilters
 *
 * @description
 * What defines the collection of the tasks of a list, fingerprinted into its cursor: the
 * collection, the list (lower-cased, since the path accepts a UUID in either case), every filter
 * (sorted and without duplicates), the level and the sort, so a cursor never continues another
 * collection or another order.
 *
 * @param {string} listId - The list of the path.
 * @param {TaskFilterInput} filter - The filters of the route.
 * @param {ListTasksQuery['sort']} sort - The sort of the query.
 * @returns {object} The filters.
 */
function listTasksFilters(
  listId: string,
  filter: TaskFilterInput,
  sort: ListTasksQuery['sort'],
): object {
  return {
    collection: 'list-tasks',
    listId: listId.toLowerCase(),
    ...taskFilterFingerprint(filter),
    sort,
  };
}

/**
 * Function sortKindOf
 *
 * @description
 * What the sort value of a cursor is for a sort of the query.
 *
 * @param {ListTasksQuery['sort']} sort - The sort of the query.
 * @returns {TaskSortKind} The kind of the sort value.
 */
function sortKindOf(sort: ListTasksQuery['sort']): TaskSortKind {
  switch (sort) {
    case 'dueDate':
    case '-dueDate':
      return 'due';
    case 'priority':
    case '-priority':
      return 'priority';
    case 'name':
    case '-name':
      return 'name';
    default:
      return 'created';
  }
}

/**
 * Function toTaskCursor
 *
 * @description
 * Encodes where the next page of the tasks of a list starts as the opaque cursor of the kit. The
 * `sort` of the cursor is `[createdAt]` for `manual` and `createdAt`, and `[value, createdAt]` for
 * the others: the due date or `null`, the rank 1 to 4 of the priority or the folded prefix of the
 * name.
 *
 * @param {TaskPosition | null} position - Where the next page starts, or `null`.
 * @param {string} listId - The list of the path.
 * @param {TaskFilterInput} filter - The filters of the route.
 * @param {ListTasksQuery['sort']} sort - The sort of the query.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toTaskCursor(
  position: TaskPosition | null,
  listId: string,
  filter: TaskFilterInput,
  sort: ListTasksQuery['sort'],
): string | null {
  return encodeTaskPosition(position, sortKindOf(sort), listTasksFilters(listId, filter, sort));
}

/**
 * Function toTaskPosition
 *
 * @description
 * Decodes the cursor of a previous page of the tasks of a list, with the same filters and sort.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string} listId - The list of the path.
 * @param {TaskFilterInput} filter - The filters of the route.
 * @param {ListTasksQuery['sort']} sort - The sort of the query.
 * @returns {TaskPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
 * collection, or whose `sort` does not have the shape of the sort.
 */
export function toTaskPosition(
  cursor: string | undefined,
  listId: string,
  filter: TaskFilterInput,
  sort: ListTasksQuery['sort'],
): TaskPosition | null {
  return decodeTaskPosition(cursor, sortKindOf(sort), listTasksFilters(listId, filter, sort));
}
