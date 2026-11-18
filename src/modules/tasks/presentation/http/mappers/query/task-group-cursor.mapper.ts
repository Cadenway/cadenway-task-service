import { PRIORITY_KEYS, STATUS_KEYS } from '@cadenway/contracts';
import { decodeCursor, encodeCursor } from '@cadenway/nest-common';
import type { CursorPosition } from '@cadenway/nest-common';

import type { GroupPosition } from '../../../../application/models/query/group-position.model.js';
import type { TaskFilterInput } from '../../../../application/models/query/task-filter-input.model.js';
import type { TaskGrouping } from '../../../../application/models/query/task-grouping.model.js';
import { invalidCursor, isRowId } from '../page/page-cursor.mapper.js';
import { taskFilterFingerprint } from './task-filter.mapper.js';

/**
 * Constant MAX_COUNT
 *
 * @description
 * The largest count a cursor carries: the largest `integer` PostgreSQL counts to.
 *
 * @type {number}
 */
const MAX_COUNT: number = 2_147_483_647;

/**
 * Function taskGroupsFilters
 *
 * @description
 * What defines the collection of the groups of a list, fingerprinted into its cursor: the
 * collection, the list (lower-cased), what the tasks are grouped by and every filter (sorted and
 * without duplicates).
 *
 * @param {string} listId - The list of the path.
 * @param {TaskGrouping} grouping - What the tasks are counted by.
 * @param {TaskFilterInput} filter - The filters of the route.
 * @returns {object} The filters.
 */
function taskGroupsFilters(
  listId: string,
  grouping: TaskGrouping,
  filter: TaskFilterInput,
): object {
  return {
    collection: 'task-groups',
    listId: listId.toLowerCase(),
    groupBy: grouping,
    ...taskFilterFingerprint(filter),
  };
}

/**
 * Function isGroupValue
 *
 * @description
 * Whether the value of a group is one the grouping can have: one of the ten statuses, one of the
 * four priorities, or an account id or `none`. The use case finds a status or a priority by its
 * place in the contract order, so an unknown value would restart the page at the first group.
 *
 * @param {TaskGrouping} grouping - What the tasks are counted by.
 * @param {string} value - The value the cursor carries.
 * @returns {boolean} Whether it names a group.
 */
function isGroupValue(grouping: TaskGrouping, value: string): boolean {
  switch (grouping) {
    case 'status':
      return STATUS_KEYS.some((key: string): boolean => key === value);
    case 'priority':
      return PRIORITY_KEYS.some((key: string): boolean => key === value);
    case 'assignee':
      return value === 'none' || isRowId(value);
  }
}

/**
 * Function toTaskGroupCursor
 *
 * @description
 * Encodes where the next page of groups starts as the opaque cursor of the kit: `sort` is
 * `[count]` and `id` the value of the last group, which "grouping is a filter" gives back as the
 * filter of that group.
 *
 * @param {GroupPosition | null} position - Where the next page starts, or `null`.
 * @param {string} listId - The list of the path.
 * @param {TaskGrouping} grouping - What the tasks are counted by.
 * @param {TaskFilterInput} filter - The filters of the route.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toTaskGroupCursor(
  position: GroupPosition | null,
  listId: string,
  grouping: TaskGrouping,
  filter: TaskFilterInput,
): string | null {
  return position === null
    ? null
    : encodeCursor(
        { sort: [position.count], id: position.value },
        taskGroupsFilters(listId, grouping, filter),
      );
}

/**
 * Function toTaskGroupPosition
 *
 * @description
 * Decodes the cursor of a previous page of groups, with the same grouping and filters. The value
 * of an assignee group is lower-cased, the form the groups are ordered in.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string} listId - The list of the path.
 * @param {TaskGrouping} grouping - What the tasks are counted by.
 * @param {TaskFilterInput} filter - The filters of the route.
 * @returns {GroupPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
 * collection, whose count is not a count or whose value is not a group of the grouping.
 */
export function toTaskGroupPosition(
  cursor: string | undefined,
  listId: string,
  grouping: TaskGrouping,
  filter: TaskFilterInput,
): GroupPosition | null {
  if (cursor === undefined) {
    return null;
  }
  const position: CursorPosition = decodeCursor(
    cursor,
    taskGroupsFilters(listId, grouping, filter),
  );
  const count: unknown = position.sort[0];
  if (
    position.sort.length !== 1 ||
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > MAX_COUNT ||
    !isGroupValue(grouping, position.id)
  ) {
    throw invalidCursor();
  }
  return { value: grouping === 'assignee' ? position.id.toLowerCase() : position.id, count };
}
