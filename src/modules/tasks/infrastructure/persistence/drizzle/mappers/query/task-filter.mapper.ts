import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { TaskFilter } from '../../../../../application/models/query/task-filter.model.js';
import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { taskLabels } from '../../schemas/task/task-label.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { anyOf } from '../page/any-of.mapper.js';
import { foldText } from './text-fold.mapper.js';

/**
 * Function assigneesOfTask
 *
 * @description
 * A correlated subquery that finds the assignees of the outer task, optionally restricted to some
 * accounts. It is a semi-join on the primary key of `task_assignees`.
 *
 * @param {readonly string[] | null} userIds - The accounts to find, `null` for any assignee.
 * @returns {SQL} The `select` of the subquery, without its parentheses.
 */
function assigneesOfTask(userIds: readonly string[] | null): SQL {
  const restriction: SQL =
    userIds === null ? sql`` : sql` and ${anyOf(taskAssignees.userId, userIds, 'uuid')}`;
  return sql`select 1 from ${taskAssignees} where ${taskAssignees.organizationId} = ${tasks.organizationId} and ${taskAssignees.taskId} = ${tasks.id}${restriction}`;
}

/**
 * Function assigneeCondition
 *
 * @description
 * The accounts or `none`: a task assigned to one of the accounts, or assigned to nobody when
 * `unassigned` is set. A branch is present only when asked; neither branch matches nothing.
 *
 * @param {{ userIds: readonly string[]; unassigned: boolean }} assignees - The assignee filter.
 * @returns {SQL} The condition.
 */
function assigneeCondition(assignees: {
  readonly userIds: readonly string[];
  readonly unassigned: boolean;
}): SQL {
  const branches: SQL[] = [];
  if (assignees.userIds.length > 0) {
    branches.push(sql`exists (${assigneesOfTask(assignees.userIds)})`);
  }
  if (assignees.unassigned) {
    branches.push(sql`not exists (${assigneesOfTask(null)})`);
  }
  return branches.length === 0 ? sql`false` : sql`(${sql.join(branches, sql` or `)})`;
}

/**
 * Function labelCondition
 *
 * @description
 * A task that has a label whose key is one of `labelKeys`: a semi-join on `task_labels`, which
 * `task_labels_key_index` serves.
 *
 * @param {readonly string[]} labelKeys - The keys of the labels.
 * @returns {SQL} The condition.
 */
function labelCondition(labelKeys: readonly string[]): SQL {
  return sql`exists (select 1 from ${taskLabels} where ${taskLabels.organizationId} = ${tasks.organizationId} and ${taskLabels.taskId} = ${tasks.id} and ${anyOf(taskLabels.labelKey, labelKeys, 'text')})`;
}

/**
 * Function searchCondition
 *
 * @description
 * The text found, folded, in the name, in the key (`CAD-482`) or in a label of the task. `strpos`
 * avoids escaping the wildcards of `LIKE`; the folded search is a constant of the statement, so
 * PostgreSQL folds it once.
 *
 * @param {string} search - The text, as sent.
 * @returns {SQL} The condition.
 */
function searchCondition(search: string): SQL {
  const key: SQL = sql`${tasks.keyPrefix} || '-' || ${tasks.keyNumber}::text`;
  return sql`(strpos(${foldText(tasks.name)}, ${foldText(search)}) > 0 or strpos(${foldText(key)}, ${foldText(search)}) > 0 or exists (select 1 from ${taskLabels} where ${taskLabels.organizationId} = ${tasks.organizationId} and ${taskLabels.taskId} = ${tasks.id} and strpos(${foldText(taskLabels.labelKey)}, ${foldText(search)}) > 0))`;
}

/**
 * Function taskFilterCondition
 *
 * @description
 * The `where` of every statement on the tasks of one list: the organization and the list, then
 * each filter that is set. Values of one filter add up (any of them), filters narrow each other
 * (`openapi/public/tasks.yaml:216`). The page, the total and the groups all use it, so they agree.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} listId - The list.
 * @param {TaskFilter} filter - What the tasks must match.
 * @returns {SQL} The condition, never empty.
 */
export function taskFilterCondition(
  organizationId: string,
  listId: string,
  filter: TaskFilter,
): SQL {
  const conditions: (SQL | undefined)[] = [
    eq(tasks.organizationId, organizationId),
    eq(tasks.listId, listId),
    filter.rootsOnly ? sql`${tasks.parentId} is null` : undefined,
    filter.statuses === null ? undefined : anyOf(tasks.status, filter.statuses, 'text'),
    filter.priorities === null ? undefined : anyOf(tasks.priority, filter.priorities, 'text'),
    filter.assignees === null ? undefined : assigneeCondition(filter.assignees),
    filter.labelKeys === null ? undefined : labelCondition(filter.labelKeys),
    filter.search === null ? undefined : searchCondition(filter.search),
    filter.dueFrom === null ? undefined : sql`${tasks.dueDate} >= ${filter.dueFrom}::date`,
    filter.dueTo === null ? undefined : sql`${tasks.dueDate} <= ${filter.dueTo}::date`,
  ];
  return and(...conditions) ?? sql`true`;
}

/**
 * Function taskWithoutAssignee
 *
 * @description
 * The condition that nobody is assigned to the task, for the group `none`.
 *
 * @returns {SQL} The condition.
 */
export function taskWithoutAssignee(): SQL {
  return sql`not exists (${assigneesOfTask(null)})`;
}
