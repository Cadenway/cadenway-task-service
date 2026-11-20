import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { canWriteTasksOf } from '../../../domain/policies/task/task-write.policy.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { DeletedListPurge } from '../../models/placement/deleted-list-purge.model.js';
import type { TrashListLock } from '../../models/placement/trash-list-lock.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
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
 * (`Task.purge`), with the actor of its entry, the root first, then by depth and id, and every
 * entry normally goes whole in one transaction. For a resumable purge the events have already
 * committed and the last remaining tasks are erased without repeating them. Then the entries go in set-based statements (`TrashEntryRepository.erase`),
 * every write of the tasks done; only then are the lists of the entries locked through the spaces
 * module, in one call, whether live or deleted (`LockTrashLists` in `erase`: their spaces
 * `FOR NO KEY UPDATE` in `(created_at, id)` order, then the lists `FOR UPDATE` in ascending id,
 * after the entries and the tasks: the global lock order). For an erasure by a person, the role of
 * the person on each list is read again under those locks: a grant revoked, or a space made
 * private, while the erasure waited for a lock refuses it (`trash-entry-not-found`, the whole
 * transaction rolled back, nothing erased). Then the lists deleted under those locks are checked,
 * in one new statement, for a task row left, and each one left without a task is handed, in id
 * order, to `PurgeDeletedList`, which erases it and its deleted space once no list of it is left.
 * Since a live list is locked too, a deletion of it either committed before the lock (the list
 * reads deleted under it, and its tombstone goes here when the erasure leaves it empty) or waits
 * for the commit (its job then reads the erased tasks gone): a final erasure and a deletion of its
 * list never leave a tombstone without a trigger. The last two erasures of one deleted list
 * serialize on its row: the second reads, under the lock, the deletes the first committed, and
 * erases the tombstone. A deleted list takes no new task (the creations and the moves hold it).
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
   * Erases the entries, checks the role of the person under the locks of their lists, and erases
   * the tombstones the entries leave without a task.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly TrashEntryErasure[]} erasures - The entries, each locked with its tasks.
   * @param {Viewer | null} editor - The person who erases, who needs `edit` on every list of the
   * entries under its lock, or `null` for the purge job, which needs no role.
   * @param {boolean} eventsAppended - Whether the caller appended these tasks' events in this transaction.
   * @returns {Promise<TrashErasureCounts>} The tasks, lists and spaces erased.
   * @throws {TaskRefusal} `trash-entry-not-found` when the person no longer has `edit` on a list
   * under its lock.
   * @throws {InvalidTaskError} When a task is not in the trash or an entry is not a tree.
   * @throws {Error} When the root of an entry is missing, a defect.
   */
  public async erase(
    store: TasksStore,
    organizationId: string,
    erasures: readonly TrashEntryErasure[],
    editor: Viewer | null,
    eventsAppended: boolean = false,
  ): Promise<TrashErasureCounts> {
    if (erasures.length === 0) {
      return { tasks: 0, listsPurged: 0, spacesPurged: 0 };
    }
    if (!eventsAppended) await this.announce(store, erasures);
    await store.intakeContacts.purge(
      organizationId,
      erasures.flatMap(({ tasks }) => tasks.map((task) => task.snapshot.id)),
    );
    await store.trash.erase(
      organizationId,
      erasures.map(({ entry }: TrashEntryErasure): string => entry.id),
    );
    const listIds: readonly string[] = [
      ...new Set(erasures.map(({ entry }: TrashEntryErasure): string => entry.listId)),
    ].sort();
    const locks: readonly TrashListLock[] = await this.spaces.lockTrashLists(
      organizationId,
      listIds,
      'erase',
      editor,
    );
    if (
      editor !== null &&
      !locks.every(
        (lock: TrashListLock): boolean => lock.role !== null && canWriteTasksOf(lock.role),
      )
    ) {
      throw new TaskRefusal({ reason: 'trash-entry-not-found' });
    }
    let listsPurged: number = 0;
    let spacesPurged: number = 0;
    for (const listId of await this.emptyTombstones(store, organizationId, locks)) {
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

  /** Appends every event of locked entries in root-first order. */
  private async announce(store: TasksStore, erasures: readonly TrashEntryErasure[]): Promise<void> {
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
  }

  /**
   * Method emptyTombstones
   *
   * @description
   * The lists deleted under their locks that no task row references any more, read in one new
   * statement after the deletes of the caller.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly TrashListLock[]} locks - What the lock of the lists of the entries found.
   * @returns {Promise<readonly string[]>} The deleted lists left without a task, in id order.
   */
  private async emptyTombstones(
    store: TasksStore,
    organizationId: string,
    locks: readonly TrashListLock[],
  ): Promise<readonly string[]> {
    const deleted: readonly string[] = locks
      .filter((lock: TrashListLock): boolean => lock.outcome === 'deleted')
      .map((lock: TrashListLock): string => lock.listId)
      .sort();
    if (deleted.length === 0) {
      return [];
    }
    const held: ReadonlySet<string> = await store.tasks.listsWithTasks(organizationId, deleted);
    return deleted.filter((listId: string): boolean => !held.has(listId));
  }
  // #endregion
}
