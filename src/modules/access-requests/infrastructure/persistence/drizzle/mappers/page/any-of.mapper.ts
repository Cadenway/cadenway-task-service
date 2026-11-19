import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Function anyOf
 *
 * @description
 * The condition `column = ANY($values::uuid[])`: the values travel as one array parameter, so the
 * statement is the same whatever the number of values, and an empty array matches no row.
 *
 * @param {AnyPgColumn} column - The column to compare, of type `uuid`.
 * @param {readonly string[]} values - The ids.
 * @returns {SQL} The condition.
 */
export function anyOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} = any(${sql.param([...values])}::uuid[])`;
}
