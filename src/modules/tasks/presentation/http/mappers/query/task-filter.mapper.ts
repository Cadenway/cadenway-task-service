import type { TaskFilterInput } from '../../../../application/models/query/task-filter-input.model.js';
import type { TaskOrder } from '../../../../application/models/query/task-order.model.js';
import type { ListTasksQuery } from '../../dto/input/task/list-tasks-query.dto.js';

/**
 * Function distinct
 *
 * @description
 * The distinct values of a filter, in the order they were first written.
 *
 * @param {readonly TValue[] | undefined} values - The values of a parameter, already split.
 * @returns {readonly TValue[] | null} The distinct values, `null` when the parameter is absent.
 */
function distinct<TValue>(values: readonly TValue[] | undefined): readonly TValue[] | null {
  return values === undefined ? null : [...new Set<TValue>(values)];
}

/**
 * Function sortedDistinct
 *
 * @description
 * The distinct values of a filter in a fixed order, for the fingerprint of a cursor.
 *
 * @param {readonly string[] | null} values - The values of a filter.
 * @returns {string[] | null} The distinct values, sorted, `null` for no filter.
 */
function sortedDistinct(values: readonly string[] | null): string[] | null {
  return values === null ? null : [...new Set(values)].sort();
}

/**
 * Function toKey
 *
 * @description
 * Narrows the text of a sort key, which the contract limits to five keys, to the key of an order.
 *
 * @param {string} key - The sort without its sign.
 * @returns {TaskOrder['key']} The key.
 */
function toKey(key: string): TaskOrder['key'] {
  switch (key) {
    case 'dueDate':
    case 'priority':
    case 'name':
    case 'createdAt':
      return key;
    default:
      return 'manual';
  }
}

/**
 * Function toTaskFilterInput
 *
 * @description
 * Gives the filters of `GET /internal/v1/lists/{listId}/tasks` and `.../task-groups` the shape the
 * use cases take: every list without duplicates, `null` for a filter the query does not name, the
 * account ids in lower case (`me` and `none` stay as they are, the use case resolves them) and the
 * level as the query gives it. The labels and the search text are kept as sent: the folding of the
 * contract ("without regard to case") belongs to the use case and to SQL.
 *
 * @param {Pick<ListTasksQuery, 'status' | 'priority' | 'assignee' | 'label' | 'search' | 'dueFrom' | 'dueTo' | 'level'>} query
 * The validated query.
 * @returns {TaskFilterInput} The filters of the route.
 */
export function toTaskFilterInput(
  query: Pick<
    ListTasksQuery,
    'status' | 'priority' | 'assignee' | 'label' | 'search' | 'dueFrom' | 'dueTo' | 'level'
  >,
): TaskFilterInput {
  return {
    statuses: distinct(query.status),
    priorities: distinct(query.priority),
    assignees: distinct(query.assignee?.map((token: string): string => token.toLowerCase())),
    labels: distinct(query.label),
    search: query.search ?? null,
    dueFrom: query.dueFrom ?? null,
    dueTo: query.dueTo ?? null,
    level: query.level,
  };
}

/**
 * Function taskFilterFingerprint
 *
 * @description
 * What the filters of a collection of tasks contribute to the fingerprint of its cursor: every list
 * sorted and without duplicates, so that the order the caller wrote the values in does not change
 * the collection. The account ids are already in lower case.
 *
 * @param {TaskFilterInput} filter - The filters of the route.
 * @returns {object} The filters to fingerprint.
 */
export function taskFilterFingerprint(filter: TaskFilterInput): {
  readonly status: string[] | null;
  readonly priority: string[] | null;
  readonly assignee: string[] | null;
  readonly label: string[] | null;
  readonly search: string | null;
  readonly dueFrom: string | null;
  readonly dueTo: string | null;
  readonly level: 'roots' | 'all';
} {
  return {
    status: sortedDistinct(filter.statuses),
    priority: sortedDistinct(filter.priorities),
    assignee: sortedDistinct(filter.assignees),
    label: sortedDistinct(filter.labels),
    search: filter.search,
    dueFrom: filter.dueFrom,
    dueTo: filter.dueTo,
    level: filter.level,
  };
}

/**
 * Function toTaskOrder
 *
 * @description
 * Reads the `sort` of the query: the key, and whether a leading `-` reverses it.
 *
 * @param {ListTasksQuery['sort']} sort - The sort of the query, `manual` by default.
 * @returns {TaskOrder} The order.
 */
export function toTaskOrder(sort: ListTasksQuery['sort']): TaskOrder {
  return sort.startsWith('-')
    ? { key: toKey(sort.slice(1)), descending: true }
    : { key: toKey(sort), descending: false };
}
