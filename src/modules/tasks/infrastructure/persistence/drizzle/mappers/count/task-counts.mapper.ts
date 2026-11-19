import { and, eq, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { tasks } from '../../schemas/task/task.schema.js';
import { assignedTasksCondition, assignedTasksSource } from '../assignee/assigned-task.mapper.js';
import { anyOf } from '../page/any-of.mapper.js';
import { liveTask } from '../task/live-task.mapper.js';
import { hasStatus, isClosed, isLateOn, isNotClosed } from './closed-status.mapper.js';

/**
 * Function countsOfListsStatement
 *
 * @description
 * The counts of the live top-level tasks of lists (`liveTask`), one row per list that has one, in
 * one grouped scan: all, not closed (`CLOSED_STATUS_KEYS`), `done`, `cancelled`, and late (`isLate` of the
 * lateness policy: not closed and due strictly before `today`).
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists.
 * @param {string} today - The date of the caller, `YYYY-MM-DD`.
 * @returns {SQL} The statement; each row is `{ listId, total, open, done, cancelled, late }`.
 */
export function countsOfListsStatement(
  organizationId: string,
  listIds: readonly string[],
  today: string,
): SQL {
  return sql`select ${tasks.listId} as "listId", count(*)::int as "total", (count(*) filter (where ${isNotClosed()}))::int as "open", (count(*) filter (where ${hasStatus('done')}))::int as "done", (count(*) filter (where ${hasStatus('cancelled')}))::int as "cancelled", (count(*) filter (where ${isLateOn(today)}))::int as "late" from ${tasks} where ${and(eq(tasks.organizationId, organizationId), anyOf(tasks.listId, listIds, 'uuid'), isNull(tasks.parentId), liveTask())} group by ${tasks.listId}`;
}

/**
 * Function stateCountsStatement
 *
 * @description
 * The tasks assigned to an account in some lists, subtasks included, by tab of "Mes tâches".
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} userId - The account.
 * @param {readonly string[]} listIds - The lists the actor has a role on.
 * @returns {SQL} The statement; one row `{ open, closed }`.
 */
export function stateCountsStatement(
  organizationId: string,
  userId: string,
  listIds: readonly string[],
): SQL {
  return sql`select (count(*) filter (where ${isNotClosed()}))::int as "open", (count(*) filter (where ${isClosed()}))::int as "closed" from ${assignedTasksSource()} where ${assignedTasksCondition(organizationId, userId, listIds)}`;
}

/**
 * Function homeStatsStatement
 *
 * @description
 * The counters of "Accueil" over the tasks assigned to an account in some lists, subtasks
 * included: not closed, late (not closed, due strictly before `today`), not closed and due
 * `today`, and `done`.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} userId - The account.
 * @param {readonly string[]} listIds - The lists the actor has a role on.
 * @param {string} today - The date of the caller, `YYYY-MM-DD`.
 * @returns {SQL} The statement; one row `{ assigned, late, dueToday, done }`.
 */
export function homeStatsStatement(
  organizationId: string,
  userId: string,
  listIds: readonly string[],
  today: string,
): SQL {
  return sql`select (count(*) filter (where ${isNotClosed()}))::int as "assigned", (count(*) filter (where ${isLateOn(today)}))::int as "late", (count(*) filter (where ${isNotClosed()} and ${tasks.dueDate} = ${today}::date))::int as "dueToday", (count(*) filter (where ${hasStatus('done')}))::int as "done" from ${assignedTasksSource()} where ${assignedTasksCondition(organizationId, userId, listIds)}`;
}
