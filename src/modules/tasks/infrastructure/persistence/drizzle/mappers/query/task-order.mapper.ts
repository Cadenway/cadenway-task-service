import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { SORT_KEY_PREFIX_LENGTH } from '../../../../../domain/value-objects/task/sort-key-prefix-length.value-object.js';
import type { TaskOrder } from '../../../../../application/models/query/task-order.model.js';
import type { TaskPosition } from '../../../../../application/models/query/task-position.model.js';
import { PRIORITY_KEYS } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { foldText } from './text-fold.mapper.js';

/**
 * Function priorityRank
 *
 * @description
 * The rank 1 to 4 of the priority of a task, `urgente` first
 * (`openapi/internal/task-service.yaml:3417-3427`).
 *
 * @returns {SQL} The expression.
 */
function priorityRank(): SQL {
  const keys: string = PRIORITY_KEYS.map((key: string): string => `'${key}'`).join(', ');
  return sql`array_position(array[${sql.raw(keys)}]::text[], ${tasks.priority})`;
}

/**
 * Function namePrefix
 *
 * @description
 * The folded name cut to its first `SORT_KEY_PREFIX_LENGTH` code points, in the `C` collation so the order does not depend
 * on the locale of the database.
 *
 * @returns {SQL} The expression.
 */
function namePrefix(): SQL {
  return sql`left(${foldText(tasks.name)}, ${sql.raw(String(SORT_KEY_PREFIX_LENGTH))}) collate "C"`;
}

/**
 * Function dueDateKey
 *
 * @description
 * The due date as a sort key: a task without one is `infinity` in the ascending order and
 * `-infinity` in the descending one, so it is last in both.
 *
 * @param {boolean} descending - Whether the order is reversed.
 * @returns {SQL} The expression.
 */
function dueDateKey(descending: boolean): SQL {
  return sql`coalesce(${tasks.dueDate}, ${sql.raw(descending ? "'-infinity'" : "'infinity'")}::date)`;
}

/**
 * Function sortKey
 *
 * @description
 * The expression a key sorts by before the tie-breaker `(created_at, id)`, `null` for the keys
 * that are the order of the list itself.
 *
 * @param {TaskOrder} order - The order.
 * @returns {SQL | null} The expression, or `null` for `manual` and `createdAt`.
 */
function sortKey(order: TaskOrder): SQL | null {
  switch (order.key) {
    case 'dueDate':
      return dueDateKey(order.descending);
    case 'priority':
      return priorityRank();
    case 'name':
      return namePrefix();
    default:
      return null;
  }
}

/**
 * Function sortValueExpression
 *
 * @description
 * The value of a row that goes into its position (`TaskPosition.sortValue`): `null` for the order
 * of creation, the due date as text (or `null`), the rank of the priority, the folded prefix of the
 * name.
 *
 * @param {TaskOrder} order - The order.
 * @returns {SQL} The expression.
 */
export function sortValueExpression(order: TaskOrder): SQL {
  switch (order.key) {
    case 'dueDate':
      return sql`${tasks.dueDate}::text`;
    case 'priority':
      return priorityRank();
    case 'name':
      return namePrefix();
    default:
      return sql`null::text`;
  }
}

/**
 * Function orderTerms
 *
 * @description
 * The terms of `ORDER BY` of a page. `manual` and `createdAt` are `(created_at, id)`, reversed
 * entirely by a leading `-`. Every other key sorts by its value, reversed alone by a leading `-`
 * (ties stay in the order of the list, ascending), then by `(created_at, id)`. A task without a
 * due date is last in both directions.
 *
 * @param {TaskOrder} order - The order.
 * @returns {SQL} The comma-separated terms.
 */
export function orderTerms(order: TaskOrder): SQL {
  const key: SQL | null = sortKey(order);
  if (key === null) {
    return order.descending
      ? sql`${tasks.createdAt} desc, ${tasks.id} desc`
      : sql`${tasks.createdAt}, ${tasks.id}`;
  }
  return sql`${key}${order.descending ? sql` desc` : sql``}, ${tasks.createdAt}, ${tasks.id}`;
}

/**
 * Function keyParameter
 *
 * @description
 * The sort value of a position as a typed parameter, to compare with the key of a row.
 *
 * @param {TaskOrder} order - The order.
 * @param {TaskPosition} after - The position.
 * @returns {SQL} The parameter.
 * @throws {Error} When the sort value does not have the shape the order sorts by.
 */
function keyParameter(order: TaskOrder, after: TaskPosition): SQL {
  const value: string | number | null = after.sortValue;
  switch (order.key) {
    case 'dueDate':
      if (value !== null && typeof value !== 'string') {
        break;
      }
      return value === null
        ? sql`${sql.raw(order.descending ? "'-infinity'" : "'infinity'")}::date`
        : sql`${value}::date`;
    case 'priority':
      if (typeof value !== 'number') {
        break;
      }
      return sql`${value}::int`;
    case 'name':
      if (typeof value !== 'string') {
        break;
      }
      return sql`${value}::text collate "C"`;
    default:
      break;
  }
  throw new Error(
    `The position does not fit the order ${order.descending ? '-' : ''}${order.key}.`,
  );
}

/**
 * Function keysetAfterOrder
 *
 * @description
 * The condition that keeps the rows strictly after a position in an order, as row-value
 * comparisons on the sort key and `(created_at, id)`. With the key reversed and the tie ascending
 * the row value cannot be used, so the condition is `key < $k or (key = $k and (created_at, id) >
 * ($c, $id))`.
 *
 * @param {TaskOrder} order - The order of the page.
 * @param {TaskPosition | null} after - The last row of the previous page, `null` for the first.
 * @returns {SQL | undefined} The condition, or `undefined` for the first page.
 */
export function keysetAfterOrder(order: TaskOrder, after: TaskPosition | null): SQL | undefined {
  if (after === null) {
    return undefined;
  }
  const instant: SQL = sql`${after.createdAt.toISOString()}::timestamptz`;
  const id: SQL = sql`${after.id}::uuid`;
  const key: SQL | null = sortKey(order);
  if (key === null) {
    return sql`(${tasks.createdAt}, ${tasks.id}) ${sql.raw(order.descending ? '<' : '>')} (${instant}, ${id})`;
  }
  const parameter: SQL = keyParameter(order, after);
  if (!order.descending) {
    return sql`(${key}, ${tasks.createdAt}, ${tasks.id}) > (${parameter}, ${instant}, ${id})`;
  }
  return sql`(${key} < ${parameter} or (${key} = ${parameter} and (${tasks.createdAt}, ${tasks.id}) > (${instant}, ${id})))`;
}
