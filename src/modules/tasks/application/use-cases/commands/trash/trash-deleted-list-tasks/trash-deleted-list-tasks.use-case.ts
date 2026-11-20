import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { showsParent } from '../../../../../domain/policies/subtask/subtask-tree.policy.js';
import type { DeletedListPurge } from '../../../../models/placement/deleted-list-purge.model.js';
import type { HeldList } from '../../../../models/placement/held-list.model.js';
import type { LockedDeletedList } from '../../../../models/placement/locked-deleted-list.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { LockedTrashTrees } from '../../../../models/trash/locked-trash-trees.model.js';
import type { TrashCandidateRoot } from '../../../../models/trash/trash-candidate-root.model.js';
import type { TrashTree } from '../../../../models/trash/trash-tree.model.js';
import type { TrashedTree } from '../../../../models/trash/trashed-tree.model.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskReferenceInListView } from '../../../../projections/task/task-reference-in-list.projection.js';
import { TrashTreeLocker } from '../../../../services/trash/trash-tree-locker.service.js';
import { TrashWriter } from '../../../../services/trash/trash-writer.service.js';
import type { TrashDeletedListTasksInput } from './trash-deleted-list-tasks.input.js';
import type { TrashDeletedListTasksOutput } from './trash-deleted-list-tasks.output.js';

/**
 * Constant MAX_ROOTS
 *
 * @description
 * How many roots one batch reads and examines at most.
 *
 * @type {number}
 */
const MAX_ROOTS: number = 50;

/**
 * Constant MAX_TASKS
 *
 * @description
 * A batch stops taking roots once their trees hold this many tasks or more (the first root is
 * always taken): with 651 live tasks at most per tree, a batch moves 1,150 live tasks at most
 * (499 + 651), plus the archived subtasks under them, which the product does not limit.
 *
 * @type {number}
 */
const MAX_TASKS: number = 500;

/**
 * Class TrashDeletedListTasks
 *
 * @description
 * One batch of the move to the trash of the tasks of a deleted list (decision 8 of the P3b-1
 * brief; "deleting a list or a space makes one entry per top-level task with its subtasks",
 * archived tasks included, "Entries" of `openapi/public/trash.yaml`), in the tenant transaction of
 * its caller, the deletion job of the deletion-lifecycle module, or in its own.
 *
 * It reads the candidate roots of the list after the position, in the order of the list
 * (`created_at`, then id), 50 at most: its tasks out of the trash that read as top-level (no
 * parent, or a parent in another list or in the trash), live or archived. Then it locks their
 * trees at once (`TrashTreeLocker`: each root and every descendant of it in the list out of the
 * trash, live or archived, read in one recursive statement; the roots taken until their trees
 * hold 500 tasks or more; their tasks locked in one statement by id, without checklists, and the
 * trees read again under the locks). A root that no longer qualifies under its lock (gone, in the
 * trash, moved or attached meanwhile) is skipped. Then the list is held `FOR SHARE` (`HoldList`,
 * lock order tasks then lists): when it is no longer deleted, the batch writes nothing:
 * `list-live` for a list a restoration brought back (a restoration of an entry of a deleted list
 * waits for its job to finish, so only a list restored after its job leaves nothing behind),
 * `list-gone` for an unknown or erased list. Otherwise each tree makes one entry (`TrashWriter`:
 * the transaction instant, the actor who deleted the list), an archived task keeping its archive (out
 * of the archives while in the trash), in one bulk update, with one `task.trashed.v1` per task,
 * entry after entry. So an archived top-level task makes its own entry, and an archived subtask
 * goes with its top-level ancestor. With no candidate left, the list is locked first, its space
 * before it, in the modes the erasure of its tombstone needs (`LockDeletedList`, no task locked on
 * that path: `list-live` or `list-gone` unless it is still deleted); a list that
 * still holds a task out of the trash answers `rescan` (a safety net: the job starts the list
 * again); otherwise a list no task row references any more is handed to the spaces module
 * (`PurgeDeletedList`), which erases a deleted list and then its deleted space once no list of it
 * is left (`none-left`), all under that lock. A deleted list takes no new task and loses none (a
 * creation and a move hold both their lists), so the candidates before the position never grow.
 */
export class TrashDeletedListTasks {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module, to hold and to erase the list. */
  private readonly spaces: SpaceDirectory;

  /** Locks the trees of the roots. */
  private readonly trees: TrashTreeLocker;

  /** Moves the trees to the trash. */
  private readonly writer: TrashWriter;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the spaces directory.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(unitOfWork: TasksUnitOfWork, spaces: SpaceDirectory) {
    this.unitOfWork = unitOfWork;
    this.spaces = spaces;
    this.trees = new TrashTreeLocker();
    this.writer = new TrashWriter();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Runs one batch.
   *
   * @param {TrashDeletedListTasksInput} input - The organization, the list and the position.
   * @returns {Promise<TrashDeletedListTasksOutput>} What the batch did.
   * @throws {Error} When a tree holds a cycle of parent links, keeps changing while it is
   * locked or overlaps another, or a task changed under its lock: defects, which roll the batch
   * back.
   */
  public async execute(input: TrashDeletedListTasksInput): Promise<TrashDeletedListTasksOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<TrashDeletedListTasksOutput> => {
      const { organizationId, listId } = input;
      const candidates: readonly TrashCandidateRoot[] = await store.tasks.trashCandidates(
        organizationId,
        listId,
        input.after,
        MAX_ROOTS,
      );
      if (candidates.length === 0) {
        return this.purgeEmptyList(store, organizationId, listId);
      }
      const locked: LockedTrashTrees = await this.trees.lock(
        store,
        organizationId,
        candidates.map((candidate: TrashCandidateRoot): string => candidate.id),
        [],
        MAX_TASKS,
      );
      const last: TrashCandidateRoot | undefined = candidates[locked.examined.length - 1];
      if (last === undefined) {
        throw new Error(`The batch of the list ${listId} examined no root.`);
      }
      const trees: readonly TrashTree[] = await this.rootsOfList(
        store,
        organizationId,
        listId,
        locked.trees,
      );
      const list: HeldList = await this.spaces.holdList(organizationId, listId);
      if (list.outcome !== 'deleted') {
        return this.notDeleted(list);
      }
      const now: Date = await store.clock.now();
      const trashed: readonly TrashedTree[] = await this.writer.trash(
        store,
        organizationId,
        trees,
        list.deletedBy,
        now,
      );
      return {
        outcome: 'trashed',
        entries: trashed.length,
        taskIds: trashed.flatMap((tree: TrashedTree): readonly string[] =>
          tree.tasks.map((task: Task): string => task.snapshot.id),
        ),
        last: { createdAt: last.createdAt, id: last.id },
      };
    });
  }

  /**
   * Method rootsOfList
   *
   * @description
   * The trees whose root still roots an entry of the list under the locks: a task of the list
   * that reads as top-level (no parent, or a parent in another list or in the trash, the parents
   * read in one statement). A tree read under the locks holds its root out of the trash.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the job.
   * @param {string} listId - The deleted list.
   * @param {readonly TrashTree[]} trees - The trees, locked.
   * @returns {Promise<readonly TrashTree[]>} Those that still qualify, in their order.
   */
  private async rootsOfList(
    store: TasksStore,
    organizationId: string,
    listId: string,
    trees: readonly TrashTree[],
  ): Promise<readonly TrashTree[]> {
    const ofList: readonly TrashTree[] = trees.filter(
      (tree: TrashTree): boolean => tree.root.snapshot.listId === listId,
    );
    const parentIds: readonly string[] = [
      ...new Set(
        ofList
          .map((tree: TrashTree): string | null => tree.root.snapshot.parentId)
          .filter((parentId: string | null): parentId is string => parentId !== null),
      ),
    ];
    const parents: ReadonlyMap<string, TaskReferenceInListView> =
      parentIds.length === 0 ? new Map() : await store.reader.references(organizationId, parentIds);
    return ofList.filter((tree: TrashTree): boolean => {
      const { parentId } = tree.root.snapshot;
      const parent: TaskReferenceInListView | undefined =
        parentId === null ? undefined : parents.get(parentId);
      return parent === undefined || !showsParent(listId, parent.listId, parent.inTrash);
    });
  }

  /**
   * Method purgeEmptyList
   *
   * @description
   * With no candidate left after the position, locks the list first, in the modes an erasure of
   * its tombstone needs and in the global lock order (`LockDeletedList`: a deleted list has its
   * space locked `FOR NO KEY UPDATE`, then the list `FOR UPDATE`; no task is locked on this path),
   * so the checks of the remaining tasks and the erasure of the tombstone run under those locks
   * and `PurgeDeletedList` takes no stronger list lock (no upgrade from a shared lock, which would
   * wait in a cycle with the clean-up of a member who left, which locks the space, then the list).
   * A list no longer deleted (a restoration brought it back) answers `list-live`, an unknown or
   * erased one `list-gone`. A deleted list that still holds a task out of the trash (behind the
   * position: a safety net, as no task enters or leaves a deleted list) answers `rescan`, writing
   * nothing, and the job starts it again from the start. Otherwise a deleted list is handed to the
   * spaces module when no task row references it any more (a task in the trash still does, until
   * its entry is erased; an erasure of it serializes with this batch on the list).
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the job.
   * @param {string} listId - The list.
   * @returns {Promise<TrashDeletedListTasksOutput>} `list-live`, `list-gone`, `rescan`, or
   * `none-left` with what was erased.
   */
  private async purgeEmptyList(
    store: TasksStore,
    organizationId: string,
    listId: string,
  ): Promise<TrashDeletedListTasksOutput> {
    const list: LockedDeletedList = await this.spaces.lockDeletedList(organizationId, listId);
    if (list.outcome === 'live') {
      return { outcome: 'list-live' };
    }
    if (list.outcome === 'not-found') {
      return { outcome: 'list-gone' };
    }
    const pending: ReadonlySet<string> = await store.tasks.listsWithUntrashedTasks(organizationId, [
      listId,
    ]);
    if (pending.has(listId)) {
      return { outcome: 'rescan' };
    }
    const held: ReadonlySet<string> = await store.tasks.listsWithTasks(organizationId, [listId]);
    if (held.has(listId)) {
      return { outcome: 'none-left', listPurged: false, spacePurged: false };
    }
    const purge: DeletedListPurge = await this.spaces.purgeDeletedList(organizationId, listId);
    return purge.outcome === 'purged'
      ? { outcome: 'none-left', listPurged: true, spacePurged: purge.spacePurged }
      : { outcome: 'none-left', listPurged: false, spacePurged: false };
  }

  /**
   * Method notDeleted
   *
   * @description
   * The outcome of a batch whose list is no longer deleted under its hold: `list-live` for a list
   * a restoration brought back, `list-gone` for an unknown or erased one.
   *
   * @param {Exclude<HeldList, { outcome: 'deleted' }>} list - The list as held.
   * @returns {TrashDeletedListTasksOutput} The outcome, which writes nothing.
   */
  private notDeleted(list: Exclude<HeldList, { outcome: 'deleted' }>): TrashDeletedListTasksOutput {
    return list.outcome === 'live' ? { outcome: 'list-live' } : { outcome: 'list-gone' };
  }
  // #endregion
}
