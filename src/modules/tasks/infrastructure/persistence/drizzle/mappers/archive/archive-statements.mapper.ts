import { and, eq, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { ArchivePosition } from '../../../../../application/models/archive/archive-position.model.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { anyOf } from '../page/any-of.mapper.js';
import { instantText, taskPageColumns } from '../query/task-page-row.mapper.js';
import { liveTask } from '../task/live-task.mapper.js';

/**
 * Function archivedRootsCondition
 *
 * @description
 * The roots of the archives of some lists: `archive_root_id = id`, the exact predicate of the
 * partial index `tasks_archive_root_index` on `(organization_id, archived_at, id)`, so a page is an
 * ordered scan of that index walked backwards from the keyset.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists the actor has a role on.
 * @returns {SQL} The condition.
 */
function archivedRootsCondition(organizationId: string, listIds: readonly string[]): SQL {
  return (
    and(
      eq(tasks.organizationId, organizationId),
      sql`${tasks.archiveRootId} = ${tasks.id}`,
      anyOf(tasks.listId, listIds, 'uuid'),
    ) ?? sql`false`
  );
}

/**
 * Function archivedRootsPageStatement
 *
 * @description
 * A page of the roots of the archives of some lists, the most recently archived first
 * (`archived_at desc, id desc`, "Archives", tab "Tâches"), strictly after a position, at most
 * `limit` rows: the columns of a summary and the archive. Built without a connection, so a test
 * can `EXPLAIN` it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists the actor has a role on.
 * @param {ArchivePosition | null} after - The last root of the previous page, `null` for the first.
 * @param {number} limit - How many rows at most.
 * @returns {SQL} The statement; each row is a `RawArchivedRootRow`.
 */
export function archivedRootsPageStatement(
  organizationId: string,
  listIds: readonly string[],
  after: ArchivePosition | null,
  limit: number,
): SQL {
  const keyset: SQL =
    after === null
      ? sql``
      : sql` and (${tasks.archivedAt}, ${tasks.id}) < (${after.archivedAt.toISOString()}::timestamptz, ${after.id}::uuid)`;
  return sql`select ${taskPageColumns()}, ${instantText(tasks.archivedAt)} as "archivedAt", ${tasks.archivedByType} as "archivedByType", ${tasks.archivedById} as "archivedById" from ${tasks} where ${archivedRootsCondition(organizationId, listIds)}${keyset} order by ${tasks.archivedAt} desc, ${tasks.id} desc limit ${limit}`;
}

/**
 * Function archivedRootsCountStatement
 *
 * @description
 * The number of the roots of the archives of some lists, with the condition of the page.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists the actor has a role on.
 * @returns {SQL} The statement; one row `{ total }`.
 */
export function archivedRootsCountStatement(
  organizationId: string,
  listIds: readonly string[],
): SQL {
  return sql`select count(*)::int as "total" from ${tasks} where ${archivedRootsCondition(organizationId, listIds)}`;
}

/**
 * Function archiveMemberCountsStatement
 *
 * @description
 * The members of archives, their roots included, one row per root, in one grouped scan of
 * `tasks_archive_member_index` (partial on `archive_root_id is not null`).
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} rootIds - The roots of the archives.
 * @returns {SQL} The statement; each row is `{ rootId, members }`.
 */
export function archiveMemberCountsStatement(
  organizationId: string,
  rootIds: readonly string[],
): SQL {
  return sql`select ${tasks.archiveRootId} as "rootId", count(*)::int as "members" from ${tasks} where ${and(
    eq(tasks.organizationId, organizationId),
    sql`${tasks.archiveRootId} is not null`,
    anyOf(tasks.archiveRootId, rootIds, 'uuid'),
  )} group by ${tasks.archiveRootId}`;
}

/**
 * Function liveRootCountsStatement
 *
 * @description
 * The live top-level tasks of lists, one row per list that has one, in one grouped scan of
 * `tasks_list_created_index`: the `taskCount` of an archived list (`liveTask`, subtasks left out).
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists.
 * @returns {SQL} The statement; each row is `{ listId, total }`.
 */
export function liveRootCountsStatement(organizationId: string, listIds: readonly string[]): SQL {
  return sql`select ${tasks.listId} as "listId", count(*)::int as "total" from ${tasks} where ${and(
    eq(tasks.organizationId, organizationId),
    anyOf(tasks.listId, listIds, 'uuid'),
    isNull(tasks.parentId),
    liveTask(),
  )} group by ${tasks.listId}`;
}

/**
 * Function writeArchivesStatement
 *
 * @description
 * The archive or the restoration of tasks in one `UPDATE ... FROM unnest(...)` statement: the four
 * archive columns (all `null` for a restoration), the parent (`null` for a root detached), the
 * version and the instant of each, guarded by the version before the change
 * (`version = changed.version - 1`), scoped to the organization. The caller checks that every
 * row was written.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly TaskState[]} states - The tasks after the change.
 * @returns {SQL} The statement.
 */
export function writeArchivesStatement(organizationId: string, states: readonly TaskState[]): SQL {
  const ids: string[] = states.map((state: TaskState): string => state.id);
  const archivedAt: (string | null)[] = states.map((state: TaskState): string | null =>
    state.archive === null ? null : state.archive.at.toISOString(),
  );
  const byType: (string | null)[] = states.map(
    (state: TaskState): string | null => state.archive?.by.type ?? null,
  );
  const byId: (string | null)[] = states.map(
    (state: TaskState): string | null => state.archive?.by.id ?? null,
  );
  const rootIds: (string | null)[] = states.map(
    (state: TaskState): string | null => state.archive?.rootId ?? null,
  );
  const parentIds: (string | null)[] = states.map(
    (state: TaskState): string | null => state.parentId,
  );
  const versions: string[] = states.map((state: TaskState): string => String(state.version));
  const instants: string[] = states.map((state: TaskState): string =>
    state.updatedAt.toISOString(),
  );
  return sql`update ${tasks} set archived_at = changed.archived_at, archived_by_type = changed.archived_by_type, archived_by_id = changed.archived_by_id, archive_root_id = changed.archive_root_id, parent_id = changed.parent_id, version = changed.version, updated_at = changed.updated_at from unnest(${sql.param(ids)}::uuid[], ${sql.param(archivedAt)}::timestamptz[], ${sql.param(byType)}::text[], ${sql.param(byId)}::text[], ${sql.param(rootIds)}::uuid[], ${sql.param(parentIds)}::uuid[], ${sql.param(versions)}::int[], ${sql.param(instants)}::timestamptz[]) as changed (id, archived_at, archived_by_type, archived_by_id, archive_root_id, parent_id, version, updated_at) where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.id} = changed.id and ${tasks.version} = changed.version - 1`;
}
