import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { LabelPosition } from '../../../../../application/models/label/label-position.model.js';
import { taskLabels } from '../../schemas/task/task-label.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { anyOf } from '../page/any-of.mapper.js';
import { foldText } from '../query/text-fold.mapper.js';

/**
 * Function labelPageStatement
 *
 * @description
 * A page of the labels of the tasks in some spaces, any level, one row per `label_key`, by the
 * folded key then the key, both in the `C` collation. The name is the spelling that comes first
 * (`min` in code point order, so `Auth` before `auth`) among the rows of the visible tasks only,
 * so a space the actor does not see leaks no spelling. Built without a connection, so a test can
 * `EXPLAIN` it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} spaceIds - The spaces the actor sees.
 * @param {string | null} search - The text to find in the key, folded; `null` for every label.
 * @param {LabelPosition | null} after - The last label of the previous page, `null` for the first.
 * @param {number} limit - How many rows at most.
 * @returns {SQL} The statement; each row is `{ name, sortKey, labelKey }`.
 */
export function labelPageStatement(
  organizationId: string,
  spaceIds: readonly string[],
  search: string | null,
  after: LabelPosition | null,
  limit: number,
): SQL {
  const sortKey: SQL = sql`${foldText(taskLabels.labelKey)} collate "C"`;
  const conditions: (SQL | undefined)[] = [
    eq(taskLabels.organizationId, organizationId),
    eq(tasks.organizationId, organizationId),
    anyOf(tasks.spaceId, spaceIds, 'uuid'),
    search === null
      ? undefined
      : sql`strpos(${foldText(taskLabels.labelKey)}, ${foldText(search)}) > 0`,
    after === null
      ? undefined
      : sql`(${sortKey}, ${taskLabels.labelKey} collate "C") > (${after.sortKey}::text collate "C", ${after.labelKey}::text collate "C")`,
  ];
  return sql`select min(${taskLabels.name} collate "C") as "name", ${sortKey} as "sortKey", ${taskLabels.labelKey} as "labelKey" from ${taskLabels} join ${tasks} on ${tasks.organizationId} = ${taskLabels.organizationId} and ${tasks.id} = ${taskLabels.taskId} where ${and(...conditions)} group by ${taskLabels.labelKey} order by "sortKey", ${taskLabels.labelKey} collate "C" limit ${limit}`;
}
