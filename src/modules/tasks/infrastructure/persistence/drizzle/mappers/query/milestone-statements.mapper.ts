import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { MilestonePosition } from '../../../../../application/models/query/milestone-position.model.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { anyOf } from '../page/any-of.mapper.js';
import { liveTask } from '../task/live-task.mapper.js';
import { taskPageColumns } from './task-page-row.mapper.js';

/**
 * Selects visible live milestones of the supplied active lists in stable due-date order.
 *
 * @param {string} organizationId - The organization of the request.
 * @param {readonly string[]} listIds - Visible, active lists of the space.
 * @param {MilestonePosition | null} after - The last task of the previous page.
 * @param {number} limit - Maximum number of rows to return.
 * @returns {SQL} The tenant-scoped page statement.
 */
export function milestonesStatement(
  organizationId: string,
  listIds: readonly string[],
  after: MilestonePosition | null,
  limit: number,
): SQL {
  const keyset: SQL =
    after === null
      ? sql``
      : sql` and (coalesce(${tasks.dueDate}, 'infinity'::date), ${tasks.id}) > (coalesce(${after.dueDate}::date, 'infinity'::date), ${after.id}::uuid)`;
  return sql`select ${taskPageColumns()}, null as "sortValue" from ${tasks}
    where ${tasks.organizationId} = ${organizationId}::uuid
      and ${anyOf(tasks.listId, listIds, 'uuid')}
      and ${tasks.milestone} = true and ${liveTask()}${keyset}
    order by ${tasks.dueDate} asc nulls last, ${tasks.id} asc limit ${limit}`;
}

/**
 * Counts the same visible milestones as the page statement.
 *
 * @param {string} organizationId - The organization of the request.
 * @param {readonly string[]} listIds - Visible, active lists of the space.
 * @returns {SQL} The tenant-scoped count statement.
 */
export function milestoneTotalStatement(organizationId: string, listIds: readonly string[]): SQL {
  return sql`select count(*)::int as "total" from ${tasks}
    where ${tasks.organizationId} = ${organizationId}::uuid
      and ${anyOf(tasks.listId, listIds, 'uuid')}
      and ${tasks.milestone} = true and ${liveTask()}`;
}
