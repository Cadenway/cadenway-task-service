import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { DeletedListPurge } from '../../models/placement/deleted-list-purge.model.js';
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
 * entries go in set-based statements (`TrashEntryRepository.erase`), and each list of the entries
 * that no task row references any more is handed to the spaces module (`PurgeDeletedList`), which
 * erases a deleted list and its deleted space once no list of it is left, and leaves a live list
 * alone. A deleted list takes no new task (the creations and the moves hold it), so a list found
 * empty stays empty until the commit.
 */
export class TrashEraser {
  // #region Properties
  /** The spaces module, which erases the tombstones. */
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
    ];
    const held: ReadonlySet<string> = await store.tasks.listsWithTasks(organizationId, listIds);
    let listsPurged: number = 0;
    let spacesPurged: number = 0;
    for (const listId of listIds.filter((id: string): boolean => !held.has(id))) {
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
  // #endregion
}
