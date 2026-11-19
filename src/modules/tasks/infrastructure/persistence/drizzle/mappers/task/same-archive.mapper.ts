import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { tasks } from '../../schemas/task/task.schema.js';
import { untrashedTask } from './untrashed-task.mapper.js';

/**
 * Constant parentTasks
 *
 * @description
 * `tasks` again, as the parent of the rows of `tasks` a subtask read joins by primary key.
 *
 * @type {ReturnType<typeof alias<typeof tasks, 'parent_tasks'>>}
 */
export const parentTasks: ReturnType<typeof alias<typeof tasks, 'parent_tasks'>> = alias(
  tasks,
  'parent_tasks',
);

/**
 * Function parentOfTask
 *
 * @description
 * The join of a row of `tasks` with its parent (`parentTasks`), on the primary key of the parent,
 * in the same organization.
 *
 * @returns {SQL} The join condition.
 */
export function parentOfTask(): SQL {
  return sql`${parentTasks.organizationId} = ${tasks.organizationId} and ${parentTasks.id} = ${tasks.parentId}`;
}

/**
 * Function sameArchiveAsParent
 *
 * @description
 * The one rule of the subtask reads ("Tasks" of `openapi/public/archives.yaml`; the subtask counts
 * of `Task` and `TaskSummary`, `GET /tasks/{taskKey}/subtasks` and the subtasks of the detail): the
 * subtasks shown of a task are those of its archive, `archive_root_id IS NOT DISTINCT FROM` the
 * one of the parent, and not in the trash ("those archived or in the trash left out"). A live task
 * shows its live subtasks; an archived task shows the subtasks archived with it, not those of an
 * older archive. A subtask in the trash has no archive, so the same-archive rule alone would keep
 * it under a live parent: the trash condition leaves it out.
 *
 * @returns {SQL} The condition on `tasks` joined with `parentTasks` (`parentOfTask`).
 */
export function sameArchiveAsParent(): SQL {
  return sql`(${tasks.archiveRootId} is not distinct from ${parentTasks.archiveRootId} and ${untrashedTask()})`;
}
