import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { showsParent } from '../../../domain/policies/subtask/subtask-tree.policy.js';
import { purgeAtOf } from '../../../domain/policies/trash/trash-retention.policy.js';
import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { TrashEntryDraft } from '../../models/trash/trash-entry-draft.model.js';
import type { TrashEntryRecord } from '../../models/trash/trash-entry-record.model.js';
import type { TrashTree } from '../../models/trash/trash-tree.model.js';
import type { TrashedTree } from '../../models/trash/trashed-tree.model.js';
import type { TaskReferenceInListView } from '../../projections/task/task-reference-in-list.projection.js';
import { TaskAnnouncer } from '../task/task-announcer.service.js';

/**
 * Class TrashWriter
 *
 * @description
 * Moves locked trees of tasks to the trash, one entry per tree ("deleting a task moves it and its
 * subtasks at every level to the trash as one entry", "Entries" of `openapi/public/trash.yaml`):
 * the deletion of a task by a person and the move of the tasks of a deleted list by its job. One
 * instant (the transaction instant) and one actor for all; one statement for the entries, one
 * bulk update of every task (its entry, its next version and `updatedAt`; an archived task keeps
 * its archive, out of the archives while in the trash), then one `task.trashed.v1` per task, entry
 * after entry, the root first, then by depth and id, each with its entry, the key of its root and
 * the purge instant (`purgeAtOf`). The trash is not
 * recorded in the activity log. The `parentKey` of an entry is the parent of its root as the root
 * reads once the trees are in the trash (`showsParent`: in its list and not in the trash, a parent
 * taken by the same call included), `null` for a top-level task.
 */
export class TrashWriter {
  // #region Properties
  /** Appends the events. */
  private readonly announcer: TaskAnnouncer;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Builds the writer.
   *
   * @constructor
   */
  public constructor() {
    this.announcer = new TaskAnnouncer();
  }
  // #endregion

  // #region Methods
  /**
   * Method trash
   *
   * @description
   * Makes one entry of each tree and moves its tasks to it.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly TrashTree[]} trees - The trees, each locked with its root.
   * @param {TaskActor} by - Who deleted them, the actor of the entries and of their events.
   * @param {Date} now - The transaction instant, the `trashedAt` of the entries.
   * @returns {Promise<readonly TrashedTree[]>} The entries and their tasks, in the order of the
   * trees.
   * @throws {InvalidTaskError} When a task is in the trash already or a tree is not a tree.
   * @throws {Error} When an entry or a root is missing, or a task changed under its lock: defects.
   */
  public async trash(
    store: TasksStore,
    organizationId: string,
    trees: readonly TrashTree[],
    by: TaskActor,
    now: Date,
  ): Promise<readonly TrashedTree[]> {
    if (trees.length === 0) {
      return [];
    }
    const parentKeys: readonly (string | null)[] = await this.parentKeysOf(
      store,
      organizationId,
      trees,
    );
    const drafts: readonly TrashEntryDraft[] = trees.map(
      (tree: TrashTree, index: number): TrashEntryDraft => ({
        organizationId,
        rootTaskId: tree.root.snapshot.id,
        listId: tree.root.snapshot.listId,
        parentKey: parentKeys[index] ?? null,
        taskCount: tree.members.length,
        trashedAt: now,
        trashedBy: { type: by.type, id: by.id },
      }),
    );
    const entries: readonly TrashEntryRecord[] = await store.trash.insertMany(drafts);
    const trashed: readonly TrashedTree[] = trees.map(
      (tree: TrashTree, index: number): TrashedTree => {
        const entry: TrashEntryRecord | undefined = entries[index];
        if (entry === undefined) {
          throw new Error(`The entry of ${tree.root.snapshot.id} was not stored.`);
        }
        const tasks: readonly Task[] = tree.members.map((member: Task): Task =>
          member.trash(entry.id, now),
        );
        const root: Task | undefined = tasks.find(
          (task: Task): boolean => task.snapshot.id === tree.root.snapshot.id,
        );
        if (root === undefined) {
          throw new Error(`The entry ${entry.id} lost its root ${tree.root.snapshot.id}.`);
        }
        return { entry, root, tasks };
      },
    );
    await store.tasks.writeTrash(
      organizationId,
      entries.map((entry: TrashEntryRecord): string => entry.id),
      trashed.flatMap((tree: TrashedTree): readonly Task[] => tree.tasks),
    );
    const purgeAt: Date = purgeAtOf(now);
    for (const tree of trashed) {
      await this.announcer.trashed(store.events, tree.root, tree.tasks, purgeAt, by);
    }
    return trashed;
  }

  /**
   * Method parentKeysOf
   *
   * @description
   * The parent each root reads with once the trees are in the trash, from one read of the parents
   * (their list and whether they are in the trash as they are now): a parent taken by one of the
   * trees counts as in the trash.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly TrashTree[]} trees - The trees.
   * @returns {Promise<readonly (string | null)[]>} The key of the parent of each root, `null` when
   * it reads as detached or has none, in the order of the trees.
   */
  private async parentKeysOf(
    store: TasksStore,
    organizationId: string,
    trees: readonly TrashTree[],
  ): Promise<readonly (string | null)[]> {
    const taken: ReadonlySet<string> = new Set(
      trees.flatMap((tree: TrashTree): readonly string[] =>
        tree.members.map((member: Task): string => member.snapshot.id),
      ),
    );
    const parentIds: readonly string[] = [
      ...new Set(
        trees
          .map((tree: TrashTree): string | null => tree.root.snapshot.parentId)
          .filter((parentId: string | null): parentId is string => parentId !== null),
      ),
    ];
    const parents: ReadonlyMap<string, TaskReferenceInListView> =
      parentIds.length === 0 ? new Map() : await store.reader.references(organizationId, parentIds);
    return trees.map((tree: TrashTree): string | null => {
      const { parentId, listId } = tree.root.snapshot;
      const parent: TaskReferenceInListView | undefined =
        parentId === null ? undefined : parents.get(parentId);
      return parentId !== null &&
        parent !== undefined &&
        showsParent(listId, parent.listId, parent.inTrash || taken.has(parentId))
        ? parent.key
        : null;
    });
  }
  // #endregion
}
