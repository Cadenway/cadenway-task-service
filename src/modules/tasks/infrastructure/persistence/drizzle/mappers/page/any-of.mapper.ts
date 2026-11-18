import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Function anyOf
 *
 * @description
 * The condition `column = ANY($values::type[])`: the values travel as one array parameter, so the
 * statement is the same whatever the number of values (a batch of ids is one parameter, not one
 * placeholder per id).
 *
 * @param {AnyPgColumn} column - The column to compare.
 * @param {readonly string[]} values - The values; none matches no row.
 * @param {'uuid' | 'text'} type - The SQL type of the column.
 * @returns {SQL} The condition.
 */
export function anyOf(column: AnyPgColumn, values: readonly string[], type: 'uuid' | 'text'): SQL {
  return sql`${column} = any(${sql.param([...values])}::${sql.raw(type)}[])`;
}
