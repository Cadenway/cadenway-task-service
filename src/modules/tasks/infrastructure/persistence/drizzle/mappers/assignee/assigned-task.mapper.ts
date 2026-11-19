import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { anyOf } from '../page/any-of.mapper.js';
import { liveTask } from '../task/live-task.mapper.js';

/**
 * Function assignedTasksSource
 *
 * @description
 * The `from` of the tasks assigned to an account: `task_assignees` through
 * `task_assignees_user_index`, joined to `tasks` by primary key.
 *
 * @returns {SQL} The `from` clause without the keyword.
 */
export function assignedTasksSource(): SQL {
  return sql`${taskAssignees} join ${tasks} on ${tasks.organizationId} = ${taskAssignees.organizationId} and ${tasks.id} = ${taskAssignees.taskId}`;
}

/**
 * Function assignedTasksCondition
 *
 * @description
 * The `where` of the live tasks assigned to an account in the lists the actor has a role on,
 * subtasks included (`liveTask`: an archived task leaves "Mes tâches" and "Accueil"). It names the
 * organization on both tables.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} userId - The account.
 * @param {readonly string[]} listIds - The lists the actor has a role on.
 * @returns {SQL} The condition.
 */
export function assignedTasksCondition(
  organizationId: string,
  userId: string,
  listIds: readonly string[],
): SQL {
  return (
    and(
      eq(taskAssignees.organizationId, organizationId),
      eq(taskAssignees.userId, userId),
      eq(tasks.organizationId, organizationId),
      anyOf(tasks.listId, listIds, 'uuid'),
      liveTask(),
    ) ?? sql`false`
  );
}
