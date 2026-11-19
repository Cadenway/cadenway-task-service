import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { spaces } from '../../schemas/space/space.schema.js';

/**
 * Function spacePositionInSidebar
 *
 * @description
 * The position of a space in the sidebar and in every collection of spaces:
 * `coalesce(restored_at, created_at)`, when it last came back from the trash or else when it was
 * created ("Restoring one of them brings back its list and the space, at the end of the sidebar" of
 * `openapi/public/spaces.yaml`), the value `positionInSidebarOf` of the domain computes. The
 * collections order by it, then by id. No index orders that expression: an organization holds few
 * spaces, which the collections sort.
 *
 * @returns {SQL<Date>} The expression, over the columns of `spaces`.
 */
export function spacePositionInSidebar(): SQL<Date> {
  return sql<Date>`coalesce(${spaces.restoredAt}, ${spaces.createdAt})`;
}
