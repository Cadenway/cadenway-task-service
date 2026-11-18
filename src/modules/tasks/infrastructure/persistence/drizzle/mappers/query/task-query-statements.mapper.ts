import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { TaskFilter } from '../../../../../application/models/query/task-filter.model.js';
import type { TaskGrouping } from '../../../../../application/models/query/task-grouping.model.js';
import type { TaskOrder } from '../../../../../application/models/query/task-order.model.js';
import type { TaskPosition } from '../../../../../application/models/query/task-position.model.js';
import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { taskFilterCondition, taskWithoutAssignee } from './task-filter.mapper.js';
import { keysetAfterOrder, orderTerms, sortValueExpression } from './task-order.mapper.js';
import { taskPageColumns } from './task-page-row.mapper.js';

/**
 * Function pageStatement
 *
 * @description
 * The page of the tasks of a list that match a filter, in an order, after a position: one range of
 * `tasks_list_created_index` on the organization and the list, the filters on the rows, the keyset
 * condition of the order and `limit` rows. The statement is built without a connection, so a test
 * can `EXPLAIN` it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} listId - The list.
 * @param {TaskFilter} filter - What the tasks must match.
 * @param {TaskOrder} order - The order of the page.
 * @param {TaskPosition | null} after - The last task of the previous page, `null` for the first.
 * @param {number} limit - How many rows at most.
 * @returns {SQL} The statement; each row is a `RawTaskPageRow`.
 */
export function pageStatement(
  organizationId: string,
  listId: string,
  filter: TaskFilter,
  order: TaskOrder,
  after: TaskPosition | null,
  limit: number,
): SQL {
  const keyset: SQL | undefined = keysetAfterOrder(order, after);
  return sql`select ${taskPageColumns()}, ${sortValueExpression(order)} as "sortValue" from ${tasks} where ${taskFilterCondition(organizationId, listId, filter)}${
    keyset === undefined ? sql`` : sql` and ${keyset}`
  } order by ${orderTerms(order)} limit ${limit}`;
}

/**
 * Function countStatement
 *
 * @description
 * The number of the tasks of a list that match a filter, with the same condition as the page.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} listId - The list.
 * @param {TaskFilter} filter - What the tasks must match.
 * @returns {SQL} The statement; one row `{ total }`.
 */
export function countStatement(organizationId: string, listId: string, filter: TaskFilter): SQL {
  return sql`select count(*)::int as "total" from ${tasks} where ${taskFilterCondition(organizationId, listId, filter)}`;
}

/**
 * Function groupStatement
 *
 * @description
 * The groups of the tasks of a list that match a filter. Status and priority: one grouped scan,
 * the groups without a task absent. Assignee: one row per account assigned to at least one
 * matching task (a task with two assignees counts in both), then one row `none` for the matching
 * tasks nobody is assigned to, always present.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} listId - The list.
 * @param {TaskFilter} filter - What the tasks must match.
 * @param {TaskGrouping} grouping - What the tasks are counted by.
 * @returns {SQL} The statement; each row is `{ value, count }`.
 */
export function groupStatement(
  organizationId: string,
  listId: string,
  filter: TaskFilter,
  grouping: TaskGrouping,
): SQL {
  const condition: SQL = taskFilterCondition(organizationId, listId, filter);
  if (grouping === 'status' || grouping === 'priority') {
    const column = grouping === 'status' ? tasks.status : tasks.priority;
    return sql`select ${column} as "value", count(*)::int as "count" from ${tasks} where ${condition} group by ${column}`;
  }
  return sql`select "grouped_assignees"."user_id"::text as "value", count(*)::int as "count" from ${tasks} join ${taskAssignees} as "grouped_assignees" on "grouped_assignees"."organization_id" = ${tasks.organizationId} and "grouped_assignees"."task_id" = ${tasks.id} where ${condition} group by "grouped_assignees"."user_id" union all select 'none'::text as "value", count(*)::int as "count" from ${tasks} where ${condition} and ${taskWithoutAssignee()}`;
}
