import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { tasks } from '../../schemas/task/task.schema.js';
import { liveTask } from './live-task.mapper.js';

/**
 * Constant childTasks
 *
 * @description
 * `tasks` again, as the child each recursive step of the subtree joins to the level above.
 *
 * @type {ReturnType<typeof alias<typeof tasks, 'child'>>}
 */
export const childTasks: ReturnType<typeof alias<typeof tasks, 'child'>> = alias(tasks, 'child');

/**
 * Function subtreeStatement
 *
 * @description
 * The live descendants of a task in a recursive CTE through `tasks_parent_created_index`, bounded
 * to three levels of descendants (two are allowed, one more is read to see a violation): each
 * level, the first and every recursive step, keeps the live subtasks only (`liveTask`, on `tasks`
 * then on `childTasks`), so an archived subtask, and what hangs from it, is left out. Built without
 * a connection, so a test can render it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} taskId - The task.
 * @returns {SQL} The statement; each row is `{ id, depth }`, in the order of the depth then id.
 */
export function subtreeStatement(organizationId: string, taskId: string): SQL {
  return sql`
    with recursive tree (id, depth) as (
      select ${tasks.id}, 1
      from ${tasks}
      where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.parentId} = ${taskId}::uuid
        and ${liveTask()}
      union all
      select ${childTasks.id}, tree.depth + 1
      from tree
      join ${tasks} as ${childTasks}
        on ${childTasks.organizationId} = ${organizationId}::uuid and ${childTasks.parentId} = tree.id
      where tree.depth < 3 and ${liveTask(childTasks)}
    )
    select id, depth::int as depth from tree order by depth, id
  `;
}
