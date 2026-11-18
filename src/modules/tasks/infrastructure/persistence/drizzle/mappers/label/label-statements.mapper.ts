import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { SORT_KEY_PREFIX_LENGTH } from '../../../../../domain/value-objects/task/sort-key-prefix-length.value-object.js';
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
 * first `SORT_KEY_PREFIX_LENGTH` code points of the folded key then the key, both in the `C`
 * collation. The name is the spelling that comes first (`min` in code point order, so `Auth` before
 * `auth`) among the rows of the visible tasks only, so a space the actor does not see leaks no
 * spelling.
 *
 * The visible label rows are grouped first, in a materialized CTE that also folds the key once per
 * group; the search, the keyset and the order then work on the groups, so the fold runs once per
 * distinct key and not once per label row. `MATERIALIZED` is the fence that keeps PostgreSQL from
 * pushing the search and the keyset into the grouped query, where they would fold every label row
 * again (measured: 141 ms against 29 ms on 150,000 label rows). A search that folds to the empty
 * text matches nothing. Built without a connection, so a test can `EXPLAIN` it.
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
  const visibleLabels: SQL = sql`select min(${taskLabels.name} collate "C") as "name", ${foldText(taskLabels.labelKey)} as "foldedKey", ${taskLabels.labelKey} as "labelKey" from ${taskLabels} join ${tasks} on ${tasks.organizationId} = ${taskLabels.organizationId} and ${tasks.id} = ${taskLabels.taskId} where ${and(
    eq(taskLabels.organizationId, organizationId),
    eq(tasks.organizationId, organizationId),
    anyOf(tasks.spaceId, spaceIds, 'uuid'),
  )} group by ${taskLabels.labelKey}`;
  const sortKey: SQL = sql`left("foldedKey", ${sql.raw(String(SORT_KEY_PREFIX_LENGTH))})`;
  const conditions: (SQL | undefined)[] = [
    search === null
      ? undefined
      : sql`(${foldText(search)} <> '' and strpos("foldedKey", ${foldText(search)}) > 0)`,
    after === null
      ? undefined
      : sql`(${sortKey} collate "C", "labelKey" collate "C") > (${after.sortKey}::text collate "C", ${after.labelKey}::text collate "C")`,
  ];
  const where: SQL | undefined = and(...conditions);
  return sql`with "visible_labels" as materialized (${visibleLabels}) select "name", ${sortKey} as "sortKey", "labelKey" from "visible_labels"${
    where === undefined ? sql`` : sql` where ${where}`
  } order by ${sortKey} collate "C", "labelKey" collate "C" limit ${limit}`;
}
