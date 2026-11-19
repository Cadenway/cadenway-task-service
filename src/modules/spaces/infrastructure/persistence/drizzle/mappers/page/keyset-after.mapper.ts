import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';

/**
 * Function keysetAfter
 *
 * @description
 * The condition that keeps the rows after a page position in the order `(instant, id)`: a
 * row-value comparison. The instant is the `created_at` column of the spaces, which the index
 * starting with the organization serves, or the position of a list in its space
 * (`listPositionInSpace`, `coalesce(restored_at, created_at)`). The position travels as an ISO
 * instant and a text id, cast to the column types; both instants have millisecond precision, so
 * the instant of a row round-trips exactly through a JavaScript `Date`.
 *
 * @param {AnyPgColumn | SQL} instant - The column or the expression that orders the rows.
 * @param {AnyPgColumn} id - The `id` column of the table.
 * @param {PagePosition | null} after - The position, `null` for the first page.
 * @returns {SQL | undefined} The condition, or `undefined` for the first page (no condition).
 */
export function keysetAfter(
  instant: AnyPgColumn | SQL,
  id: AnyPgColumn,
  after: PagePosition | null,
): SQL | undefined {
  if (after === null) {
    return undefined;
  }
  return sql`(${instant}, ${id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`;
}
