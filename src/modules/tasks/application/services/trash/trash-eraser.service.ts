import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import { TASK_SERVICE_ACTOR } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { TrashHandOver } from '../../../domain/value-objects/trash/trash-hand-over.value-object.js';
import type { DeletedListPurge } from '../../models/placement/deleted-list-purge.model.js';
import type { DeletedListLock } from '../../models/placement/deleted-list-lock.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { TrashEntryErasure } from '../../models/trash/trash-entry-erasure.model.js';
import type { TrashErasureCounts } from '../../models/trash/trash-erasure-counts.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { TaskAnnouncer } from '../task/task-announcer.service.js';

/**
 * Class TrashEraser
 *
 * @description
 * Erases locked trash entries for good ("Erasing" of `openapi/public/trash.yaml`: "the tasks,
 * their subtasks, checklists and activity ... A deleted list or space is erased with the last of
 * its entries. Nothing comes back from it."), the shared step of "Supprimer définitivement" and of
 * the purge job. Each task of each entry emits one `task.purged.v1` at the version of its erasure
 * (`Task.purge`), with the actor of its entry, the root first, then by depth and id. Then the
 * entries go in set-based statements (`TrashEntryRepository.erase`), and the lists of the entries
 * are locked through the spaces module in one call once their tasks are deleted
 * (`LockDeletedLists`: the spaces of the deleted ones in `(created_at, id)` order, then those
 * lists `FOR UPDATE` in ascending id, one global order; nothing for a live or erased list); only
 * the lists still deleted under those locks are checked, in one new statement, for a task row left, and each one left
 * without a task is handed, in id order, to `PurgeDeletedList`, which erases it and its deleted
 * space once no list of it is left. So the last two erasures of one deleted list serialize on its
 * row: the second reads, under the lock, the deletes the first committed, and erases the
 * tombstone. A deleted list takes no new task (the creations and the moves hold it).
 *
 * An entry too large for one batch of the purge is erased in parts (`erasePart`): the tasks the
 * batch chose (the deepest first), one `task.purged.v1` each in that order, their statements
 * scoped to them, the entry row kept with its count lowered and handed to the purge from the
 * first part on; the last part erases the entry whole.
 */
export class TrashEraser {
  // #region Properties
  /** The spaces module, which locks and erases the tombstones. */
  private readonly spaces: SpaceDirectory;

  /** Appends the events. */
  private readonly announcer: TaskAnnouncer;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the directory of the spaces.
   *
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(spaces: SpaceDirectory) {
    this.spaces = spaces;
    this.announcer = new TaskAnnouncer();
  }
  // #endregion

  // #region Methods
  /**
   * Method erase
   *
   * @description
   * Erases the entries and the tombstones they leave without a task.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly TrashEntryErasure[]} erasures - The entries, each locked with its tasks.
   * @returns {Promise<TrashErasureCounts>} The tasks, lists and spaces erased.
   * @throws {InvalidTaskError} When a task is not in the trash or an entry is not a tree.
   * @throws {Error} When the root of an entry is missing, a defect.
   */
  public async erase(
    store: TasksStore,
    organizationId: string,
    erasures: readonly TrashEntryErasure[],
  ): Promise<TrashErasureCounts> {
    if (erasures.length === 0) {
      return { tasks: 0, listsPurged: 0, spacesPurged: 0 };
    }
    const now: Date = await store.clock.now();
    for (const { entry, tasks, actor } of erasures) {
      const purged: readonly Task[] = tasks.map((task: Task): Task => task.purge(now));
      const root: Task | undefined = purged.find(
        (task: Task): boolean => task.snapshot.id === entry.rootTaskId,
      );
      if (root === undefined) {
        throw new Error(`The trash entry ${entry.id} has no root ${entry.rootTaskId}.`);
      }
      await this.announcer.purged(store.events, root, purged, actor);
    }
    await store.trash.erase(
      organizationId,
      erasures.map(({ entry }: TrashEntryErasure): string => entry.id),
    );
    const listIds: readonly string[] = [
      ...new Set(erasures.map(({ entry }: TrashEntryErasure): string => entry.listId)),
    ].sort();
    let listsPurged: number = 0;
    let spacesPurged: number = 0;
    for (const listId of await this.emptyTombstones(store, organizationId, listIds)) {
      const purge: DeletedListPurge = await this.spaces.purgeDeletedList(organizationId, listId);
      if (purge.outcome === 'purged') {
        listsPurged += 1;
        spacesPurged += purge.spacePurged ? 1 : 0;
      }
    }
    return {
      tasks: erasures.reduce(
        (total: number, { tasks }: TrashEntryErasure): number => total + tasks.length,
        0,
      ),
      listsPurged,
      spacesPurged,
    };
  }

  /**
   * Method erasePart
   *
   * @description
   * Erases a part of an entry too large for one batch: the tasks given, locked by the caller with
   * the entry, in their order (the deepest first), each emitting one `task.purged.v1` at the
   * version of its erasure; the entry row stays with its count lowered and, when it was still in
   * the trash, is handed to the purge as task-service (a hand-over keeps its requester), so it no
   * longer lists, restores or erases by a person and its remaining tasks answer
   * `task.not-found`. No tombstone is checked: the entry still holds tasks of its list.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {TrashEntryErasure} part - The entry, locked, with the tasks of the part, locked, in the
   * order to erase them, and the actor of the erasure.
   * @returns {Promise<number>} The tasks erased.
   * @throws {InvalidTaskError} When a task is not in the trash.
   * @throws {Error} When a task or the entry vanished, a defect.
   */
  public async erasePart(
    store: TasksStore,
    organizationId: string,
    part: TrashEntryErasure,
  ): Promise<number> {
    const { entry, tasks, actor } = part;
    if (tasks.length === 0) {
      return 0;
    }
    const now: Date = await store.clock.now();
    const purged: readonly Task[] = tasks.map((task: Task): Task => task.purge(now));
    await this.announcer.purgedPart(
      store.events,
      entry.id,
      TaskKey.parse(entry.root.key),
      purged,
      actor,
    );
    const handOver: TrashHandOver = entry.purgeRequest ?? { at: now, by: TASK_SERVICE_ACTOR };
    await store.trash.erasePart(
      organizationId,
      entry.id,
      tasks.map((task: Task): string => task.snapshot.id),
      handOver,
    );
    return tasks.length;
  }

  /**
   * Method emptyTombstones
   *
   * @description
   * Locks the lists of the erased entries in one call (`LockDeletedLists`: the spaces of the
   * deleted ones in `(created_at, id)` order, then those lists in ascending id), then reads,
   * under those locks and in one new statement, which of the lists still deleted no task row
   * references any more: the tombstones
   * to hand to the spaces module. Live and erased lists take no lock and are left alone.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists of the erased entries, distinct, in id order.
   * @returns {Promise<readonly string[]>} The deleted lists left without a task, in id order.
   */
  private async emptyTombstones(
    store: TasksStore,
    organizationId: string,
    listIds: readonly string[],
  ): Promise<readonly string[]> {
    const locks: readonly DeletedListLock[] = await this.spaces.lockDeletedLists(
      organizationId,
      listIds,
    );
    const deleted: readonly string[] = locks
      .filter((lock: DeletedListLock): boolean => lock.outcome === 'deleted')
      .map((lock: DeletedListLock): string => lock.listId)
      .sort();
    if (deleted.length === 0) {
      return [];
    }
    const held: ReadonlySet<string> = await store.tasks.listsWithTasks(organizationId, deleted);
    return deleted.filter((listId: string): boolean => !held.has(listId));
  }
  // #endregion
}
