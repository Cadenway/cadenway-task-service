import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';

/**
 * Function keysetAfter
 *
 * @description
 * The condition that keeps the rows strictly after a page position in the order
 * `(created_at, id)`: a row-value comparison, which the index starting with the organization
 * serves. The position travels as an ISO instant and a text id, cast to the column types;
 * `created_at` has millisecond precision, so the instant of a row round-trips exactly through a
 * JavaScript `Date`.
 *
 * @param {AnyPgColumn} createdAt - The `created_at` column of the table.
 * @param {AnyPgColumn} id - The `id` column of the table.
 * @param {PagePosition | null} after - The position, `null` for the first page.
 * @returns {SQL | undefined} The condition, or `undefined` for the first page (no condition).
 */
export function keysetAfter(
  createdAt: AnyPgColumn,
  id: AnyPgColumn,
  after: PagePosition | null,
): SQL | undefined {
  if (after === null) {
    return undefined;
  }
  return sql`(${createdAt}, ${id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`;
}
