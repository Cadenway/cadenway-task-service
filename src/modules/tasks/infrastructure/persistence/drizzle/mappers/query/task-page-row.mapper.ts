import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { ListedTask } from '../../../../../application/models/query/listed-task.model.js';
import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import { tasks } from '../../schemas/task/task.schema.js';
import type { TaskSummaryRow } from '../task/task-summary.mapper.js';
import type { RawTaskPageRow } from './raw-task-page-row.mapper.js';

/**
 * Type TaskPageRow
 *
 * @description
 * A row of a page of tasks once its instants are dates, with the value the order sorts by.
 *
 * @type {TaskSummaryRow & { sortValue: string | number | null }}
 */
export type TaskPageRow = TaskSummaryRow & { readonly sortValue: string | number | null };

/**
 * Function instantText
 *
 * @description
 * An instant column as ISO 8601 text in UTC, to the millisecond (the precision of the column).
 *
 * @param {AnyPgColumn} column - A `timestamptz(3)` column.
 * @returns {SQL} The expression.
 */
function instantText(column: AnyPgColumn): SQL {
  return sql`to_char(${column} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

/**
 * Function taskPageColumns
 *
 * @description
 * The select list of a page of tasks: the columns of a summary, without the description, the note
 * of the cancellation or the author, under the property names of `RawTaskPageRow`.
 *
 * @returns {SQL} The select list, without the sort value.
 */
export function taskPageColumns(): SQL {
  return sql.join(
    [
      sql`${tasks.id} as "id"`,
      sql`${tasks.keyPrefix} as "keyPrefix"`,
      sql`${tasks.keyNumber} as "keyNumber"`,
      sql`${tasks.name} as "name"`,
      sql`${tasks.status} as "status"`,
      sql`${tasks.cancelReason} as "cancelReason"`,
      sql`${tasks.priority} as "priority"`,
      sql`${tasks.dueDate}::text as "dueDate"`,
      sql`${tasks.startDate}::text as "startDate"`,
      sql`${tasks.estimateMinutes} as "estimateMinutes"`,
      sql`${instantText(tasks.completedAt)} as "completedAt"`,
      sql`${instantText(tasks.createdAt)} as "createdAt"`,
      sql`${tasks.listId} as "listId"`,
      sql`${tasks.spaceId} as "spaceId"`,
      sql`${tasks.parentId} as "parentId"`,
      sql`${tasks.version} as "version"`,
    ],
    sql`, `,
  );
}

/**
 * Function toTaskPageRow
 *
 * @description
 * Reads the instants of a raw row as dates.
 *
 * @param {RawTaskPageRow} raw - The row as the database returned it.
 * @returns {TaskPageRow} The row.
 */
export function toTaskPageRow(raw: RawTaskPageRow): TaskPageRow {
  return {
    ...raw,
    completedAt: raw.completedAt === null ? null : new Date(raw.completedAt),
    createdAt: new Date(raw.createdAt),
  };
}

/**
 * Function toListedTask
 *
 * @description
 * Pairs the summary of a row with the position a next page would start after it.
 *
 * @param {TaskPageRow} row - The row.
 * @param {TaskSummaryView} task - Its summary.
 * @returns {ListedTask} The listed task.
 */
export function toListedTask(row: TaskPageRow, task: TaskSummaryView): ListedTask {
  return {
    task,
    position: { sortValue: row.sortValue, createdAt: row.createdAt, id: row.id },
  };
}
