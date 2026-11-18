import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { TaskOrder } from '../../../../../application/models/query/task-order.model.js';
import type { TaskPosition } from '../../../../../application/models/query/task-position.model.js';
import type { MyTaskState } from '../../../../../application/models/user/my-task-state.model.js';
import { isClosed, isNotClosed } from '../count/closed-status.mapper.js';
import { keysetAfterOrder, orderTerms, sortValueExpression } from '../query/task-order.mapper.js';
import { taskPageColumns } from '../query/task-page-row.mapper.js';
import { assignedTasksCondition, assignedTasksSource } from './assigned-task.mapper.js';

/**
 * Constant ASSIGNED_ORDER
 *
 * @description
 * The order of "Mes tâches": by due date with the undated last, then in the order of creation.
 *
 * @type {TaskOrder}
 */
const ASSIGNED_ORDER: TaskOrder = { key: 'dueDate', descending: false };

/**
 * Function assignedPageStatement
 *
 * @description
 * A page of the tasks assigned to an account in some spaces, subtasks included, in the tab
 * `state`: by due date (undated last), then `(created_at, id)`, after a position. Built without a
 * connection, so a test can `EXPLAIN` it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} userId - The account.
 * @param {readonly string[]} spaceIds - The spaces the actor sees.
 * @param {MyTaskState} state - `open` for the tasks not closed, `closed` for `done` and `cancelled`.
 * @param {TaskPosition | null} after - The last task of the previous page, `null` for the first.
 * @param {number} limit - How many rows at most.
 * @returns {SQL} The statement; each row is a `RawTaskPageRow` whose `sortValue` is the due date.
 */
export function assignedPageStatement(
  organizationId: string,
  userId: string,
  spaceIds: readonly string[],
  state: MyTaskState,
  after: TaskPosition | null,
  limit: number,
): SQL {
  const keyset: SQL | undefined = keysetAfterOrder(ASSIGNED_ORDER, after);
  return sql`select ${taskPageColumns()}, ${sortValueExpression(ASSIGNED_ORDER)} as "sortValue" from ${assignedTasksSource()} where ${assignedTasksCondition(organizationId, userId, spaceIds)} and ${state === 'open' ? isNotClosed() : isClosed()}${
    keyset === undefined ? sql`` : sql` and ${keyset}`
  } order by ${orderTerms(ASSIGNED_ORDER)} limit ${limit}`;
}
