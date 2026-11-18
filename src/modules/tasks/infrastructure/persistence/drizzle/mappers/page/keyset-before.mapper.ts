import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { ActivityPosition } from '../../../../../application/models/activity/activity-position.model.js';

/**
 * Function keysetBefore
 *
 * @description
 * The condition that keeps the rows strictly after a page position in the order
 * `(occurred_at DESC, id DESC)`, that is the rows strictly older in the tuple order: a row-value
 * comparison, which an index starting with the organization serves in either direction. The
 * position travels as an ISO instant and a text id, cast to the column types; `occurred_at` has
 * millisecond precision, so the instant of a row round-trips exactly through a JavaScript `Date`.
 *
 * @param {AnyPgColumn} occurredAt - The `occurred_at` column of the table.
 * @param {AnyPgColumn} id - The `id` column of the table.
 * @param {ActivityPosition | null} after - The position, `null` for the first page.
 * @returns {SQL | undefined} The condition, or `undefined` for the first page (no condition).
 */
export function keysetBefore(
  occurredAt: AnyPgColumn,
  id: AnyPgColumn,
  after: ActivityPosition | null,
): SQL | undefined {
  if (after === null) {
    return undefined;
  }
  return sql`(${occurredAt}, ${id}) < (${after.occurredAt.toISOString()}::timestamptz, ${after.id}::uuid)`;
}
