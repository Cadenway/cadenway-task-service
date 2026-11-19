import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { TrashEntryDraft } from '../../../../../application/models/trash/trash-entry-draft.model.js';
import type { TrashPosition } from '../../../../../application/models/trash/trash-position.model.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { activityEntries } from '../../schemas/activity/activity-entry.schema.js';
import { checklistItems } from '../../schemas/checklist/checklist-item.schema.js';
import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { taskLabels } from '../../schemas/task/task-label.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { trashEntries } from '../../schemas/trash/trash-entry.schema.js';
import { instantText } from '../query/task-page-row.mapper.js';
import { parentOfTask, parentTasks } from '../task/same-archive.mapper.js';
import { childTasks } from '../task/subtree-statement.mapper.js';
import { untrashedTask } from '../task/untrashed-task.mapper.js';

/**
 * Constant entryRows
 *
 * @description
 * `trash_entries` as `entry`, the name every read of an entry gives it, so that the same select
 * list serves the reads of the table and the rows an insert returns (a common table expression of
 * that name).
 *
 * @type {ReturnType<typeof alias<typeof trashEntries, 'entry'>>}
 */
const entryRows: ReturnType<typeof alias<typeof trashEntries, 'entry'>> = alias(
  trashEntries,
  'entry',
);

/**
 * Constant rootRows
 *
 * @description
 * `tasks` as `root`, the root of an entry, joined by its primary key for its key, name and status.
 *
 * @type {ReturnType<typeof alias<typeof tasks, 'root'>>}
 */
const rootRows: ReturnType<typeof alias<typeof tasks, 'root'>> = alias(tasks, 'root');

/**
 * Function entryColumns
 *
 * @description
 * The select list of an entry with its root, under the property names of `RawTrashEntryRow`; the
 * instants leave PostgreSQL as ISO 8601 texts in UTC with the millisecond (`instantText`).
 *
 * @returns {SQL} The select list.
 */
function entryColumns(): SQL {
  return sql`${entryRows.id} as "id", ${entryRows.organizationId} as "organizationId", ${entryRows.rootTaskId} as "rootTaskId", ${entryRows.listId} as "listId", ${entryRows.parentKey} as "parentKey", ${entryRows.taskCount} as "taskCount", ${instantText(entryRows.trashedAt)} as "trashedAt", ${entryRows.trashedByType} as "trashedByType", ${entryRows.trashedById} as "trashedById", ${instantText(entryRows.purgeRequestedAt)} as "purgeRequestedAt", ${entryRows.purgeRequestedByType} as "purgeRequestedByType", ${entryRows.purgeRequestedById} as "purgeRequestedById", ${rootRows.keyPrefix} as "rootKeyPrefix", ${rootRows.keyNumber} as "rootKeyNumber", ${rootRows.name} as "rootName", ${rootRows.status} as "rootStatus"`;
}

/**
 * Function withRoot
 *
 * @description
 * The join of an entry with its root, by the primary key of `tasks`, in the same organization.
 *
 * @returns {SQL} The join, after `from <entry>`.
 */
function withRoot(): SQL {
  return sql`join ${tasks} as ${rootRows} on ${rootRows.organizationId} = ${entryRows.organizationId} and ${rootRows.id} = ${entryRows.rootTaskId}`;
}

/**
 * Function inTrashOfLists
 *
 * @description
 * The entries of some lists still in the trash: `purge_requested_at is null`, the predicate of the
 * partial index `trash_entries_trashed_index` on `(organization_id, trashed_at, id)`, the lists a
 * filter of its rows.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists the actor may restore the entries of.
 * @returns {SQL} The condition on `entry`.
 */
function inTrashOfLists(organizationId: string, listIds: readonly string[]): SQL {
  return sql`${entryRows.organizationId} = ${organizationId}::uuid and ${entryRows.purgeRequestedAt} is null and ${entryRows.listId} = any(${sql.param([...listIds])}::uuid[])`;
}

/**
 * Function trashEntryStatement
 *
 * @description
 * One entry by id with its root, locked `FOR UPDATE OF entry` when asked (the root row is not
 * locked: the caller locks the tasks of the entry after it).
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} entryId - The entry.
 * @param {boolean} lock - `true` to lock the entry row.
 * @returns {SQL} The statement; at most one `RawTrashEntryRow`.
 */
export function trashEntryStatement(organizationId: string, entryId: string, lock: boolean): SQL {
  const locking: SQL = lock ? sql` for update of ${sql.raw('"entry"')}` : sql``;
  return sql`select ${entryColumns()} from ${trashEntries} as ${entryRows} ${withRoot()} where ${entryRows.organizationId} = ${organizationId}::uuid and ${entryRows.id} = ${entryId}::uuid${locking}`;
}

/**
 * Function trashPageStatement
 *
 * @description
 * A page of the trash: the entries of some lists still in the trash, the most recently deleted
 * first (`trashed_at desc, id desc`), strictly after a position, at most `limit` rows, each with
 * its root. `trash_entries_trashed_index` is walked backwards from the keyset, the lists a filter
 * of its rows; the root is one probe of `tasks_pkey` per row. Built without a connection, so a
 * test can `EXPLAIN` it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists the actor may restore the entries of.
 * @param {TrashPosition | null} after - The last entry of the previous page, `null` for the first.
 * @param {number} limit - How many rows at most.
 * @returns {SQL} The statement; each row is a `RawTrashEntryRow`.
 */
export function trashPageStatement(
  organizationId: string,
  listIds: readonly string[],
  after: TrashPosition | null,
  limit: number,
): SQL {
  const keyset: SQL =
    after === null
      ? sql``
      : sql` and (${entryRows.trashedAt}, ${entryRows.id}) < (${after.trashedAt.toISOString()}::timestamptz, ${after.id}::uuid)`;
  return sql`select ${entryColumns()} from ${trashEntries} as ${entryRows} ${withRoot()} where ${inTrashOfLists(organizationId, listIds)}${keyset} order by ${entryRows.trashedAt} desc, ${entryRows.id} desc limit ${limit}`;
}

/**
 * Function trashTotalStatement
 *
 * @description
 * The number of the entries of some lists still in the trash, with the condition of the page.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists the actor may restore the entries of.
 * @returns {SQL} The statement; one row `{ total }`.
 */
export function trashTotalStatement(organizationId: string, listIds: readonly string[]): SQL {
  return sql`select count(*)::int as "total" from ${trashEntries} as ${entryRows} where ${inTrashOfLists(organizationId, listIds)}`;
}

/**
 * Function requestPurgeStatement
 *
 * @description
 * "Vider la corbeille" in one statement: the entries of some lists still in the trash get the
 * instant and the actor of their hand-over to the purge job, and leave the trash.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists the actor may restore the entries of.
 * @param {Date} at - The transaction instant.
 * @param {TaskActor} by - Who asked.
 * @returns {SQL} The statement; its row count is the number of entries handed over.
 */
export function requestPurgeStatement(
  organizationId: string,
  listIds: readonly string[],
  at: Date,
  by: TaskActor,
): SQL {
  return sql`update ${trashEntries} set purge_requested_at = ${at.toISOString()}::timestamptz, purge_requested_by_type = ${by.type}, purge_requested_by_id = ${by.id} where ${trashEntries.organizationId} = ${organizationId}::uuid and ${trashEntries.purgeRequestedAt} is null and ${trashEntries.listId} = any(${sql.param([...listIds])}::uuid[])`;
}

/**
 * Function handedOverEntriesStatement
 *
 * @description
 * The oldest entries "Vider la corbeille" handed to the purge (`purge_requested_at`, then id), at
 * most `limit`, locked `FOR UPDATE OF entry SKIP LOCKED`, each with its root: an ordered scan of
 * the partial index `trash_entries_purge_requested_index`. Two purge jobs of one organization
 * share them.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {number} limit - How many entries at most.
 * @returns {SQL} The statement; each row is a `RawTrashEntryRow`.
 */
export function handedOverEntriesStatement(organizationId: string, limit: number): SQL {
  return sql`select ${entryColumns()} from ${trashEntries} as ${entryRows} ${withRoot()} where ${entryRows.organizationId} = ${organizationId}::uuid and ${entryRows.purgeRequestedAt} is not null order by ${entryRows.purgeRequestedAt}, ${entryRows.id} limit ${limit} for update of ${sql.raw('"entry"')} skip locked`;
}

/**
 * Function dueEntriesStatement
 *
 * @description
 * The oldest entries still in the trash whose purge date passed (deleted at or before
 * `dueBefore`), by deletion instant then id, at most `limit`, locked `FOR UPDATE OF entry SKIP
 * LOCKED`, each with its root: an ordered scan of `trash_entries_trashed_index` from its start,
 * which stops at the cut-off.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {Date} dueBefore - The latest deletion instant that is due.
 * @param {number} limit - How many entries at most.
 * @returns {SQL} The statement; each row is a `RawTrashEntryRow`.
 */
export function dueEntriesStatement(organizationId: string, dueBefore: Date, limit: number): SQL {
  return sql`select ${entryColumns()} from ${trashEntries} as ${entryRows} ${withRoot()} where ${entryRows.organizationId} = ${organizationId}::uuid and ${entryRows.purgeRequestedAt} is null and ${entryRows.trashedAt} <= ${dueBefore.toISOString()}::timestamptz order by ${entryRows.trashedAt}, ${entryRows.id} limit ${limit} for update of ${sql.raw('"entry"')} skip locked`;
}

/**
 * Function insertEntriesStatement
 *
 * @description
 * New entries in one `INSERT ... SELECT FROM unnest(...)`, returned with their roots: the inserted
 * rows are the common table expression `entry`, joined with `tasks` for the key, name and status
 * of each root. PostgreSQL gives the ids (`uuidv7()`).
 *
 * @param {readonly TrashEntryDraft[]} drafts - The entries.
 * @returns {SQL} The statement; one `RawTrashEntryRow` per draft, in no particular order.
 */
export function insertEntriesStatement(drafts: readonly TrashEntryDraft[]): SQL {
  const column = <TValue>(pick: (draft: TrashEntryDraft) => TValue): TValue[] => drafts.map(pick);
  return sql`with ${sql.raw('"entry"')} as (insert into ${trashEntries} (organization_id, root_task_id, list_id, parent_key, task_count, trashed_at, trashed_by_type, trashed_by_id) select * from unnest(${sql.param(column((draft) => draft.organizationId))}::uuid[], ${sql.param(column((draft) => draft.rootTaskId))}::uuid[], ${sql.param(column((draft) => draft.listId))}::uuid[], ${sql.param(column((draft) => draft.parentKey))}::text[], ${sql.param(column((draft) => String(draft.taskCount)))}::int[], ${sql.param(column((draft) => draft.trashedAt.toISOString()))}::timestamptz[], ${sql.param(column((draft) => draft.trashedBy.type))}::text[], ${sql.param(column((draft) => draft.trashedBy.id))}::text[]) returning *) select ${entryColumns()} from ${sql.raw('"entry"')} ${withRoot()}`;
}

/**
 * Function removeEntryStatement
 *
 * @description
 * Deletes the row of one entry whose tasks were restored.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} entryId - The entry.
 * @returns {SQL} The statement; its row count is 1 when the entry was there.
 */
export function removeEntryStatement(organizationId: string, entryId: string): SQL {
  return sql`delete from ${trashEntries} where ${trashEntries.organizationId} = ${organizationId}::uuid and ${trashEntries.id} = ${entryId}::uuid`;
}

/**
 * Function eraseEntriesStatements
 *
 * @description
 * The erasure of entries with their tasks, set-based, in the order the foreign keys need: the
 * activity entries, checklist items, assignees and labels of their tasks (each through the prefix
 * `(organization_id, task_id)` of its key or index, the tasks found by `tasks_trash_entry_index`);
 * the tasks outside the entries whose parent is one of their tasks detached (`parent_id` null, no
 * version: tasks of other entries, and archived tasks out of the trash left in another list when
 * their live parent moved away), through `tasks_parent_created_index`; their tasks, in one
 * statement, the foreign key of the parent checked at its end; the entries. Every statement names
 * the organization.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} entryIds - The entries.
 * @returns {readonly SQL[]} The statements, to run in this order.
 */
export function eraseEntriesStatements(
  organizationId: string,
  entryIds: readonly string[],
): readonly SQL[] {
  const entries: SQL = sql`${sql.param([...entryIds])}::uuid[]`;
  const taskIds: SQL = sql`select ${tasks.id} from ${tasks} where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.trashEntryId} = any(${entries})`;
  const collection = (
    table:
      typeof activityEntries | typeof checklistItems | typeof taskAssignees | typeof taskLabels,
  ): SQL =>
    sql`delete from ${table} where ${table.organizationId} = ${organizationId}::uuid and ${table.taskId} in (${taskIds})`;
  return [
    collection(activityEntries),
    collection(checklistItems),
    collection(taskAssignees),
    collection(taskLabels),
    sql`update ${tasks} set parent_id = null where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.parentId} in (${taskIds}) and (${untrashedTask()} or ${tasks.trashEntryId} <> all(${entries}))`,
    sql`delete from ${tasks} where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.trashEntryId} = any(${entries})`,
    sql`delete from ${trashEntries} where ${trashEntries.organizationId} = ${organizationId}::uuid and ${trashEntries.id} = any(${entries})`,
  ];
}

/**
 * Function writeTrashStatement
 *
 * @description
 * The trash or the restoration of tasks in one `UPDATE ... FROM unnest(...)` statement: the entry
 * (`null` for a restoration), the parent (`null` for a root detached), the version and the instant
 * of each (an archived task keeps its archive columns: in the trash, it is out of the archives by
 * its entry), guarded by the version before the change (`version = changed.version - 1`), scoped
 * to the organization. The caller checks that every row was written.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly TaskState[]} states - The tasks after the change.
 * @returns {SQL} The statement.
 */
export function writeTrashStatement(organizationId: string, states: readonly TaskState[]): SQL {
  const column = <TValue>(pick: (state: TaskState) => TValue): TValue[] => states.map(pick);
  return sql`update ${tasks} set trash_entry_id = changed.trash_entry_id, parent_id = changed.parent_id, version = changed.version, updated_at = changed.updated_at from unnest(${sql.param(column((state) => state.id))}::uuid[], ${sql.param(column((state) => state.trash?.entryId ?? null))}::uuid[], ${sql.param(column((state) => state.parentId))}::uuid[], ${sql.param(column((state) => String(state.version)))}::int[], ${sql.param(column((state) => state.updatedAt.toISOString()))}::timestamptz[]) as changed (id, trash_entry_id, parent_id, version, updated_at) where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.id} = changed.id and ${tasks.version} = changed.version - 1`;
}

/**
 * Function trashCandidateRootsStatement
 *
 * @description
 * The tasks of a deleted list that root a trash entry: those out of the trash that read as
 * top-level (`untrashedTask`, and no parent, or a parent in another list or in the trash, the rule
 * of `showsParent`), live or archived, in the order of the list (`created_at, id`), strictly after a
 * position, at most `limit`: a range of `tasks_list_created_index` after the keyset, each row joined
 * with its parent by the primary key and filtered. Built without a connection, so a test can
 * `EXPLAIN` it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} listId - The list.
 * @param {PagePosition | null} after - The last root of the previous batch, `null` for the first.
 * @param {number} limit - How many roots at most.
 * @returns {SQL} The statement; each row is `{ id, createdAt }`, `createdAt` an ISO text.
 */
export function trashCandidateRootsStatement(
  organizationId: string,
  listId: string,
  after: PagePosition | null,
  limit: number,
): SQL {
  const keyset: SQL =
    after === null
      ? sql``
      : sql` and (${tasks.createdAt}, ${tasks.id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`;
  return sql`select ${tasks.id} as "id", ${instantText(tasks.createdAt)} as "createdAt" from ${tasks} left join ${tasks} as ${parentTasks} on ${parentOfTask()} where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.listId} = ${listId}::uuid and ${untrashedTask()} and (${tasks.parentId} is null or ${parentTasks.listId} <> ${tasks.listId} or not ${untrashedTask(parentTasks)})${keyset} order by ${tasks.createdAt}, ${tasks.id} limit ${limit}`;
}

/**
 * Function trashTreesStatement
 *
 * @description
 * The trees of the roots of trash entries in one recursive statement: each root out of the trash,
 * and every descendant of it in its list out of the trash, live or archived, at every level (the
 * walk stops at a child in another list or in the trash: an archived task whose live parent moved
 * away, or a subtask deleted before), through `tasks_parent_created_index`. A move and an
 * attachment count the live height only, so archived subtasks may hang at any depth: the walk has
 * no depth limit (one an editor could reach would block a deletion for good). It is finite: it
 * stays in one organization and one list, and PostgreSQL detects a cycle of parent links
 * (`CYCLE id SET is_cycle USING path`: a task met again on its own path is returned once with
 * `isCycle` and not walked further), which the caller treats as a defect the writers never make.
 * Built without a connection, so a test can `EXPLAIN` it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} rootIds - The roots.
 * @returns {SQL} The statement; each row is `{ id, rootId, depth, isCycle }`, by root, depth and
 * id.
 */
export function trashTreesStatement(organizationId: string, rootIds: readonly string[]): SQL {
  return sql`with recursive tree (id, root_id, list_id, depth) as (select ${tasks.id}, ${tasks.id}, ${tasks.listId}, 0 from ${tasks} where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.id} = any(${sql.param([...rootIds])}::uuid[]) and ${untrashedTask()} union all select ${childTasks.id}, tree.root_id, tree.list_id, tree.depth + 1 from tree join ${tasks} as ${childTasks} on ${childTasks.organizationId} = ${organizationId}::uuid and ${childTasks.parentId} = tree.id where ${childTasks.listId} = tree.list_id and ${untrashedTask(childTasks)}) cycle id set is_cycle using path select id, root_id as "rootId", depth::int as "depth", is_cycle as "isCycle" from tree order by root_id, depth, id`;
}

/**
 * Function untrashedIdsLockStatement
 *
 * @description
 * Locks the tasks of some ids `FOR SHARE` by primary key, in ascending id order, whether in the
 * trash or not, each with whether it is out of the trash (`untrashedTask`), as PostgreSQL reads
 * the row under the lock (a row it waited for is read again). Built without a connection, so a
 * test can `EXPLAIN` it.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} taskIds - The ids, UUIDs.
 * @returns {SQL} The statement; each row is `{ id, untrashed }`, by id.
 */
export function untrashedIdsLockStatement(organizationId: string, taskIds: readonly string[]): SQL {
  return sql`select ${tasks.id} as "id", ${untrashedTask()} as "untrashed" from ${tasks} where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.id} = any(${sql.param([...taskIds])}::uuid[]) order by ${tasks.id} for share`;
}

/**
 * Function listsWithTasksStatement
 *
 * @description
 * Which of some lists any task row still references, one probe of `tasks_list_created_index` per
 * list (`exists`, so a live list of many tasks costs one row).
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {readonly string[]} listIds - The lists.
 * @returns {SQL} The statement; each row is `{ listId }` of a list that holds a task.
 */
export function listsWithTasksStatement(organizationId: string, listIds: readonly string[]): SQL {
  return sql`select candidate.list_id as "listId" from unnest(${sql.param([...listIds])}::uuid[]) as candidate (list_id) where exists (select 1 from ${tasks} where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.listId} = candidate.list_id)`;
}

/**
 * Function holdsTrashToPurge
 *
 * @description
 * Whether an organization holds an entry handed to the purge or an entry still in the trash
 * deleted at or before `dueBefore`: one probe of each partial index of `trash_entries`.
 *
 * @param {SQL} organization - The organization id the probes compare with.
 * @param {Date} dueBefore - The latest deletion instant that is due.
 * @returns {SQL} The condition.
 */
function holdsTrashToPurge(organization: SQL, dueBefore: Date): SQL {
  return sql`(exists (select 1 from ${trashEntries} as handed where handed.organization_id = ${organization} and handed.purge_requested_at is not null) or exists (select 1 from ${trashEntries} as due where due.organization_id = ${organization} and due.purge_requested_at is null and due.trashed_at <= ${dueBefore.toISOString()}::timestamptz))`;
}

/**
 * Function organizationsWithTrashStatement
 *
 * @description
 * The organizations holding an entry handed to the purge, or an entry still in the trash deleted
 * at or before `dueBefore`, by id after a position, at most `limit`: the only cross-organization
 * statement of the module, for a read-only system transaction. A loose index scan: a recursive
 * walk takes the next organization of `trash_entries` after the previous one (one probe of
 * `trash_entries_pkey`), probes whether it holds something to purge (`holdsTrashToPurge`), and
 * stops once `limit` organizations qualified or none is left, so a page costs one step per
 * organization with entries it passes, never a read of their entries.
 *
 * @param {Date} dueBefore - The latest deletion instant that is due.
 * @param {string | null} after - The last organization of the previous page, `null` for the first.
 * @param {number} limit - How many organizations at most.
 * @returns {SQL} The statement; each row is `{ organizationId }`, in ascending order.
 */
export function organizationsWithTrashStatement(
  dueBefore: Date,
  after: string | null,
  limit: number,
): SQL {
  const following: SQL =
    after === null ? sql`` : sql` where first.organization_id > ${after}::uuid`;
  return sql`with recursive candidate (organization_id, qualifies, taken) as (select head.organization_id, head.qualifies, head.qualifies::int from (select first.organization_id, ${holdsTrashToPurge(sql`first.organization_id`, dueBefore)} as qualifies from (select organization_id from ${trashEntries} as first${following} order by organization_id limit 1) as first) as head union all select following.organization_id, following.qualifies, candidate.taken + following.qualifies::int from candidate cross join lateral (select next.organization_id, ${holdsTrashToPurge(sql`next.organization_id`, dueBefore)} as qualifies from (select organization_id from ${trashEntries} as entry where entry.organization_id > candidate.organization_id order by organization_id limit 1) as next) as following where candidate.taken < ${limit}) select organization_id as "organizationId" from candidate where qualifies order by organization_id limit ${limit}`;
}
