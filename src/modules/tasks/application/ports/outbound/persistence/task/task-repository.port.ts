import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';
import type { TaskStanding } from '../../../../models/task/task-standing.model.js';
import type { TrashCandidateRoot } from '../../../../models/trash/trash-candidate-root.model.js';
import type { TrashTaskWrite } from '../../../../models/trash/trash-task-write.model.js';
import type { TrashTreeNode } from '../../../../models/trash/trash-tree-node.model.js';

import type { SubtreeShape } from '../../../../../domain/value-objects/subtask/subtree-shape.value-object.js';
import type { ChecklistItemDraft } from '../../../../../domain/value-objects/task/checklist-item-draft.value-object.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { TaskDraft } from '../../../../../domain/value-objects/task/task-draft.value-object.js';
import type { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';

/**
 * Interface TaskRepository
 *
 * @description
 * The tasks of the tenant transaction, each with its ordered assignees, labels and checklist. Every
 * method filters on the organization. Locks are `FOR NO KEY UPDATE` and last until the commit; the
 * order of the locks of a write is memberships, then tasks (in ascending id when several), then the
 * key counter of the space.
 */
export interface TaskRepository {
  // #region Methods
  /**
   * Method findByKey
   *
   * @description
   * Finds a task by its key, a stored member of the task that never changes.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {TaskKey} key - The key.
   * @param {boolean} lock - `true` to lock the row `FOR NO KEY UPDATE` and read it after the lock.
   * @returns {Promise<Task | null>} The task, or `null` when the organization has none.
   */
  findByKey(organizationId: string, key: TaskKey, lock: boolean): Promise<Task | null>;

  /**
   * Method lockByIds
   *
   * @description
   * Locks several tasks in one statement, `ORDER BY id FOR NO KEY UPDATE`, and reads them after the
   * lock. Ids the organization does not hold are left out. With `withChecklists` false the tasks
   * carry an empty checklist, not loaded: only for a write that never reads, writes or emits it
   * (the members of an archive).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the tasks.
   * @param {boolean} [withChecklists] - `false` to leave the checklists unloaded; `true` when left
   * out.
   * @returns {Promise<readonly Task[]>} The tasks, in ascending id order.
   */
  lockByIds(
    organizationId: string,
    ids: readonly string[],
    withChecklists?: boolean,
  ): Promise<readonly Task[]>;

  /**
   * Method lockStanding
   *
   * @description
   * Locks one task `FOR NO KEY UPDATE` and reads only whether it is live (in no archive and not in
   * the trash), whether it is in the trash, and its list, in one statement, without its
   * collections: the parent of the root of an archive or a trash entry being restored.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<TaskStanding | null>} Its standing, or `null` when the organization has no
   * such task.
   */
  lockStanding(organizationId: string, taskId: string): Promise<TaskStanding | null>;

  /**
   * Method insert
   *
   * @description
   * Stores a new task under a key, at version 1 with an empty checklist, and its assignees and
   * labels in order. The database gives the id and the creation instant.
   *
   * @param {TaskDraft} draft - The task the domain created.
   * @param {TaskKey} key - The key allocated for it.
   * @returns {Promise<Task>} The stored task.
   */
  insert(draft: TaskDraft, key: TaskKey): Promise<Task>;

  /**
   * Method insertMany
   *
   * @description
   * Stores several new tasks, at version 1 with an empty checklist, and their assignees and labels
   * in order, in a constant number of statements (one multi-row statement for the tasks, one for
   * their assignees, one for their labels). The database gives the ids and the creation instant,
   * which the tasks of one call share; their ids increase in the order of the drafts.
   *
   * @param {readonly TaskDraft[]} drafts - The tasks the domain created.
   * @param {readonly TaskKey[]} keys - The key allocated for each draft, in the same order.
   * @returns {Promise<readonly Task[]>} The stored tasks, in the order of the drafts.
   */
  insertMany(drafts: readonly TaskDraft[], keys: readonly TaskKey[]): Promise<readonly Task[]>;

  /**
   * Method save
   *
   * @description
   * Writes the changes of a task the use case holds locked: the row, the assignees, the labels and
   * the ticks of the checklist, by comparing the two states. Items of the checklist that `after`
   * has and `before` lacks were stored by `insertChecklistItem`.
   *
   * @param {Task} before - The task as it was read.
   * @param {Task} after - The task after the change, its version being `before`'s plus one.
   * @returns {Promise<void>} Resolves once written.
   */
  save(before: Task, after: Task): Promise<void>;

  /**
   * Method insertChecklistItem
   *
   * @description
   * Stores a new item at the end of the checklist of a task; the database gives its id.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task, locked by the caller.
   * @param {ChecklistItemDraft} draft - The item the domain drafted.
   * @returns {Promise<ChecklistItemState>} The stored item.
   */
  insertChecklistItem(
    organizationId: string,
    taskId: string,
    draft: ChecklistItemDraft,
  ): Promise<ChecklistItemState>;

  /**
   * Method levelOf
   *
   * @description
   * Tells how deep a task is in its tree of subtasks.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<number>} 1 for a top-level task, 2 for its subtask, and so on.
   */
  levelOf(organizationId: string, taskId: string): Promise<number>;

  /**
   * Method subtreeOf
   *
   * @description
   * Reads the live descendants of a task and the height of its live tree: an archived subtask,
   * and what hangs from it, is not part of it (it keeps its own archive and never moves).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<SubtreeShape>} Its live descendants and the height (1 for a task without
   * live subtask).
   */
  subtreeOf(organizationId: string, taskId: string): Promise<SubtreeShape>;

  /**
   * Method childCount
   *
   * @description
   * Counts the live direct subtasks of a task, those the limit of 25 counts (an archived subtask
   * is not counted, "Tasks" of `openapi/public/archives.yaml`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent, locked by the caller when the count guards a write.
   * @returns {Promise<number>} The count.
   */
  childCount(organizationId: string, parentId: string): Promise<number>;

  /**
   * Method lockArchive
   *
   * @description
   * Locks the root's whole untrashed tree, every archive member and the root's parent in one
   * statement, `ORDER BY id FOR NO KEY UPDATE`, and reads
   * them after the lock: the tasks out of the trash whose archive was made from the root, the root
   * included (an archive in the trash is out of the archives). A task restored, or moved to the
   * trash, by another transaction while the lock waited is not returned. The members carry
   * an empty checklist, not loaded: a restoration never writes or emits it, and reads the root
   * again for its answer.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} rootId - The root of the archive.
   * @returns {Promise<readonly Task[]>} The tree, members and any parent, in ascending id order.
   */
  lockArchive(organizationId: string, rootId: string): Promise<readonly Task[]>;

  /**
   * Method writeArchives
   *
   * @description
   * Writes the archive or the restoration of tasks the caller holds locked, in one set-based
   * statement: the archive (instant, actor, root), the parent (`null` for a root detached by a
   * restoration), the version and the instant of each, guarded by the version before the change.
   * Nothing else of the task changes, so its assignees, labels and checklist are not written.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} rootId - The root of the archive made or restored, which a failure names.
   * @param {readonly Task[]} updated - The tasks after `archive` or `unarchive`, each one version
   * after the one read under its lock.
   * @returns {Promise<void>} Resolves once written.
   */
  writeArchives(organizationId: string, rootId: string, updated: readonly Task[]): Promise<void>;

  /**
   * Method lockAssignedTo
   *
   * @description
   * Locks a batch of the tasks an account is assigned to, closed ones included, in ascending id
   * order after a given id, and reads them after the lock. The tasks carry no checklist (it is
   * left empty, not loaded): they are only for the unassignment of a removed member, which never
   * reads it and whose events never carry it. Do not use them for anything else.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {string | null} afterId - The last id of the previous batch, `null` for the first.
   * @param {number} limit - The size of the batch.
   * @returns {Promise<readonly Task[]>} The tasks without checklist; fewer than `limit` on the last
   * batch.
   */
  lockAssignedTo(
    organizationId: string,
    userId: string,
    afterId: string | null,
    limit: number,
  ): Promise<readonly Task[]>;

  /**
   * Method unassignBatch
   *
   * @description
   * Removes an account from the assignees of the tasks of a batch and writes their new versions and
   * instants, in set-based statements (not one per task).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly Task[]} updated - The tasks locked by `lockAssignedTo`, after `unassign`.
   * @returns {Promise<void>} Resolves once written.
   */
  unassignBatch(organizationId: string, userId: string, updated: readonly Task[]): Promise<void>;

  /**
   * Method lockTrashEntries
   *
   * @description
   * Locks every task of some trash entries in one statement ordered by id, and reads them after
   * the lock, without their checklists (the trash never writes or emits them, so the tasks carry
   * an empty one): `FOR NO KEY UPDATE` for a restoration, `FOR UPDATE` for an erasure, which
   * deletes the rows.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} entryIds - The entries.
   * @param {boolean} forErasure - `true` to lock `FOR UPDATE`.
   * @returns {Promise<readonly Task[]>} The tasks, in ascending id order; none for an entry gone.
   */
  lockTrashEntries(
    organizationId: string,
    entryIds: readonly string[],
    forErasure: boolean,
  ): Promise<readonly Task[]>;

  /**
   * Method trashTrees
   *
   * @description
   * Reads, without a lock, in one statement, the trees that roots make in the trash: each root out
   * of the trash, and every descendant of it in its list out of the trash, live or archived, at
   * every level ("a task and its subtasks at every level", `openapi/public/trash.yaml`); the walk
   * stops at a child in another list or in the trash, and has no depth limit (archived subtasks
   * may hang at any depth).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} rootIds - The roots.
   * @param {number} [readLimit] - A bound on returned rows for sizing a single root, without
   * ordering. If the limit is reached the caller treats the expansion as too large.
   * @returns {Promise<readonly TrashTreeNode[]>} Each task of each tree, with its root and depth;
   * none for a root in the trash or gone.
   * @throws {Error} When a tree holds a cycle of parent links, which the writers never make: a
   * defect.
   */
  trashTrees(
    organizationId: string,
    rootIds: readonly string[],
    readLimit?: number,
  ): Promise<readonly TrashTreeNode[]>;

  /**
   * Method lockUntrashedIds
   *
   * @description
   * Locks the tasks of some ids `FOR SHARE` in one statement ordered by id, whether in the trash or
   * not, and tells which of them are out of the trash, live or archived, as read under the lock. A
   * restoration (`FOR NO KEY UPDATE`) or an erasure (`FOR UPDATE`) of one of them waits for the
   * commit of the caller, or committed first and is seen; the lock holds until the commit.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The ids, UUIDs.
   * @returns {Promise<readonly string[]>} Those of them that are tasks out of the trash, in
   * ascending id order.
   */
  lockUntrashedIds(organizationId: string, taskIds: readonly string[]): Promise<readonly string[]>;

  /**
   * Method writeTrash
   *
   * @description
   * Writes the trash or the restoration of tasks the caller holds locked, in one set-based
   * statement: the entry (`null` for a restoration), the archive as the task holds it (kept by the
   * trash; renewed for an archived member of a restored entry, archived again as of the
   * restoration), the parent (`null` for a root detached by a restoration), the version and the
   * instant of each, guarded by the version each had under its lock (one version before for a
   * trash or a restoration, two for a member restored then archived again). Its assignees, labels
   * and checklist are not written.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} entryIds - The entries made or restored, which a failure names.
   * @param {readonly TrashTaskWrite[]} writes - The tasks after the change, each with the version
   * read under its lock.
   * @returns {Promise<void>} Resolves once written.
   */
  writeTrash(
    organizationId: string,
    entryIds: readonly string[],
    writes: readonly TrashTaskWrite[],
  ): Promise<void>;

  /**
   * Method trashCandidates
   *
   * @description
   * Reads, without a lock, the tasks of a list that root a trash entry when the list is deleted:
   * those out of the trash that read as top-level (no parent, or a parent in another list or in the
   * trash, `showsParent`), live or archived, in the order of the list (`created_at`, then id),
   * strictly after a position.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {PagePosition | null} after - The last root of the previous batch, `null` for the first.
   * @param {number} limit - How many roots at most.
   * @returns {Promise<readonly TrashCandidateRoot[]>} The roots.
   */
  trashCandidates(
    organizationId: string,
    listId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<readonly TrashCandidateRoot[]>;

  /**
   * Method listsWithTasks
   *
   * @description
   * Tells which of some lists any task row still references (live, archived or in the trash), in
   * one statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @returns {Promise<ReadonlySet<string>>} The lists that still hold a task.
   */
  listsWithTasks(organizationId: string, listIds: readonly string[]): Promise<ReadonlySet<string>>;

  /**
   * Method listsWithUntrashedTasks
   *
   * @description
   * Tells which of some lists still hold a task out of the trash (live or archived), in one
   * statement through `tasks_list_created_index`, without a lock: in a deleted list, the tasks its
   * deletion job has not moved yet.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @returns {Promise<ReadonlySet<string>>} The lists that still hold a task out of the trash.
   */
  listsWithUntrashedTasks(
    organizationId: string,
    listIds: readonly string[],
  ): Promise<ReadonlySet<string>>;

  /**
   * Method shareLocationUnlessLocked
   *
   * @description
   * Locks the task of a key `FOR SHARE SKIP LOCKED` and reads where it is, in one statement
   * through `tasks_key_unique` whatever the outcome (a task in the trash is locked too and answers
   * `null`), without its collections: a change of another module that must not commit against a
   * task a concurrent deletion moves to the trash (which locks it `FOR NO KEY UPDATE`). A task a
   * writer holds `FOR NO KEY UPDATE` or `FOR UPDATE` is left out at once, without waiting, and
   * answers `null`: the time of the answer does not tell whether the task exists.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {TaskKey} key - The key.
   * @returns {Promise<TaskLocation | null>} The task, or `null` when the organization has none, it
   * is in the trash or a writer holds it.
   * @throws {Error} When the stored status is outside the status keys.
   */
  shareLocationUnlessLocked(organizationId: string, key: TaskKey): Promise<TaskLocation | null>;
  // #endregion
}
