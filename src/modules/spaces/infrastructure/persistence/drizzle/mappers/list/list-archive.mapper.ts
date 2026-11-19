import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { ArchivedListPosition } from '../../../../../application/models/page/archived-list-position.model.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';

/**
 * Function liveListCondition
 *
 * @description
 * The ONE condition that keeps the live lists, which the collections of a space, of the sprints
 * under way and of the sidebar apply ("An archived list leaves the sidebar, the lists of its space,
 * the overview and the lists and sprints of Accueil" of `openapi/public/archives.yaml`). The
 * readings by id, the lean rows of the roles and the archives do not apply it.
 *
 * @returns {SQL} The condition, over the columns of `lists`.
 */
export function liveListCondition(): SQL {
  return sql`${taskLists.archivedAt} is null`;
}

/**
 * Function archivedListCondition
 *
 * @description
 * The condition that keeps the archived lists, the exact predicate of the partial index
 * `lists_organization_archived_index (organization_id, archived_at, id) where archived_at is not
 * null`, so that the archives and their count read that index.
 *
 * @returns {SQL} The condition, over the columns of `lists`.
 */
export function archivedListCondition(): SQL {
  return sql`${taskLists.archivedAt} is not null`;
}

/**
 * Function archivedListAfter
 *
 * @description
 * The condition that keeps the archived lists after a page position in the order
 * `(archived_at desc, id desc)`: a row-value comparison on the columns of
 * `lists_organization_archived_index`, whose bitmap scan reads the archived lists, which the query
 * then sorts. The position travels as an ISO instant and a text
 * id, cast to the column types; `archived_at` has millisecond precision, so the instant of a row
 * round-trips exactly through a JavaScript `Date`.
 *
 * @param {ArchivedListPosition | null} after - The position, `null` for the first page.
 * @returns {SQL | undefined} The condition, or `undefined` for the first page (no condition).
 */
export function archivedListAfter(after: ArchivedListPosition | null): SQL | undefined {
  if (after === null) {
    return undefined;
  }
  return sql`(${taskLists.archivedAt}, ${taskLists.id}) < (${after.archivedAt.toISOString()}::timestamptz, ${after.id}::uuid)`;
}

/**
 * Function listPositionInSpace
 *
 * @description
 * The position of a list among the lists of its space, the order of the sidebar:
 * `coalesce(restored_at, created_at)`, when it last came back from the archives or else when it
 * was created ("Restoring a list puts it back at the end of its space" of
 * `openapi/public/archives.yaml`), the value `positionInSpaceOf` of the domain computes. The
 * collections order by it, then by id.
 *
 * @returns {SQL<Date>} The expression, over the columns of `lists`.
 */
export function listPositionInSpace(): SQL<Date> {
  return sql<Date>`coalesce(${taskLists.restoredAt}, ${taskLists.createdAt})`;
}
