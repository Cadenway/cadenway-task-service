import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import {
  takesRestoredRoot,
  treeHeight,
} from '../../../../../domain/policies/subtask/subtask-tree.policy.js';
import { subtaskCountOf } from '../../../../../domain/policies/trash/trash-entry.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { DeletedListRestoration } from '../../../../models/placement/deleted-list-restoration.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { LockedDeletedList } from '../../../../models/placement/locked-deleted-list.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TaskStanding } from '../../../../models/task/task-standing.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TrashEntryRecord } from '../../../../models/trash/trash-entry-record.model.js';
import type { TrashTaskWrite } from '../../../../models/trash/trash-task-write.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskReferenceInListView } from '../../../../projections/task/task-reference-in-list.projection.js';
import type { TaskView } from '../../../../projections/task/task-view.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskAnnouncer } from '../../../../services/task/task-announcer.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import { TrashEntryLocator } from '../../../../services/trash/trash-entry-locator.service.js';
import type { RestoreTrashEntryInput } from './restore-trash-entry.input.js';
import type { RestoreTrashEntryOutput } from './restore-trash-entry.output.js';

/**
 * Class RestoreTrashEntry
 *
 * @description
 * Brings a trash entry back to its list (`POST /internal/v1/trash/entries/{entryId}/restore`;
 * "Restoring" of `openapi/public/trash.yaml`), its root and every task of it. An entry the actor
 * may not restore (unknown, handed to the purge by "Vider la corbeille", or of a list on which
 * they would not have `edit` as if not deleted) answers `trash-entry-not-found`, never a `403`.
 *
 * Locks, in the order of the module: the membership of the actor `FOR SHARE`; the entry `FOR
 * UPDATE`, then checked again (exists, not handed over, same list), so a restoration or an erasure
 * of the same entry that committed first leaves it gone, and the entry the rest names is the
 * locked row; every task of the entry `FOR NO KEY UPDATE` in one statement ordered by id
 * (`lockTrashEntries`), without their checklists; the parent of the root, read first without a
 * lock and locked by one lean statement (`lockStanding`) only when it is out of the trash: a
 * parent in the trash detaches the root without a lock (it is not live; were its entry restored
 * meanwhile, the root would be detached all the same, a valid state), so a restoration never
 * locks a task of another entry and cannot deadlock with the erasure of the entry of its parent,
 * which locks its own tasks, then (by its detachment) the children outside it; then the list
 * through the spaces module (`LockDeletedList`: a deleted list has its space, then itself, locked
 * `FOR UPDATE`, which waits for a batch of its deletion job holding it `FOR SHARE`), under which a
 * deleted list that still holds a task out of the trash refuses the restoration with
 * `trash-entry-not-found`, writing nothing: those tasks are the pending work of its deletion job
 * (no task enters or leaves a deleted list), and the entry is restorable once the job finished,
 * within minutes (a decision beyond the contract, to report to cadenway-api-contracts: a code of
 * its own would say it); then `RestoreDeletedList`, always called, which decides on the locked
 * rows and brings back a deleted space and list, appending `space.restored.v1` and
 * `list.restored.v1` first (a refusal of it answers `trash-entry-not-found`). When it answers
 * `listRestored` for a list `LockDeletedList` read live (deleted in between, so not locked by
 * that call), the check is run again under the lock `RestoreDeletedList` then holds
 * (`FOR NO KEY UPDATE`, which conflicts with the `FOR SHARE` of a deletion batch and of
 * `HoldList`), and a task still out of the trash refuses the restoration: the refusal rolls back
 * the restored list, the restored space and their events. With both checks a restoration never
 * exposes a task its deletion job has not moved, whether the list was read deleted or live.
 *
 * A live root keeps its parent only when the domain says the parent takes it back
 * (`takesRestoredRoot`: live, in its list, fewer than 25 live subtasks, its level plus the height
 * of the live tasks of the entry 3 at most), and is detached otherwise (", détachée de son parent
 * supprimé"). An archived root keeps its parent only when the parent is out of the trash and in its
 * list (live or archived), which it can then show, and is detached otherwise, keeping its
 * archive, so `task.restored.v1` and every answer agree. Every task leaves the trash at its next
 * version and `updatedAt`; an archived one comes back archived, in its archive, so the
 * 25-subtask and 3-level limits hold (archived subtasks do not count towards them), and is
 * archived again as of the restoration (`Task.rearchive`: the instant and the actor of the
 * restoration, the same root of its archive, one more version: two in all). Every task is written
 * in one statement guarded by the version read under its lock, and the entry row is deleted; then
 * one `task.restored.v1` per task, the root first, then by depth and id, with the id of the locked
 * entry, each member that comes back archived followed at once by its `task.archived.v1` at the
 * next version (`occurredAt` its new `archivedAt`, the restoring user, the key of the root of its
 * archive), which a consumer that follows the contract applies to hide it again. An archived list
 * that is not deleted stays archived. No activity entry. The answer reads the root again by key,
 * with its checklist, as it reads (archived for an archived root), and its list through
 * `FindVisibleList`, visible again.
 */
export class RestoreTrashEntry {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module, to bring back the list and its space. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds and locks the entry. */
  private readonly entries: TrashEntryLocator;

  /** Appends the events. */
  private readonly announcer: TaskAnnouncer;

  /** Builds the view of the root. */
  private readonly views: TaskViewBuilder;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the two directories.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.unitOfWork = unitOfWork;
    this.spaces = spaces;
    this.viewers = new ViewerResolver(members);
    this.entries = new TrashEntryLocator(spaces);
    this.announcer = new TaskAnnouncer();
    this.views = new TaskViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Restores the entry.
   *
   * @param {RestoreTrashEntryInput} input - The actor and the entry.
   * @returns {Promise<RestoreTrashEntryOutput>} The root, its list and what came back.
   * @throws {TaskRefusal} `organization-not-found` or `trash-entry-not-found`.
   * @throws {Error} When the entry has no task or no root, the parent of the root or the root of
   * an archive is missing, or the restored root or its list cannot be read again: defects.
   */
  public async execute(input: RestoreTrashEntryInput): Promise<RestoreTrashEntryOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<RestoreTrashEntryOutput> => {
      const { organizationId, entryId } = input;
      const viewer: Viewer = await this.viewers.resolve(organizationId, input.actorUserId, true);
      const entry: TrashEntryRecord = await this.entries.lockRestorable(
        store,
        organizationId,
        viewer,
        entryId,
      );
      const members: readonly Task[] = await store.tasks.lockTrashEntries(
        organizationId,
        [entry.id],
        false,
      );
      const root: Task | undefined = members.find(
        (member: Task): boolean => member.snapshot.id === entry.rootTaskId,
      );
      if (root === undefined) {
        throw new Error(`The trash entry ${entry.id} has no root ${entry.rootTaskId}.`);
      }
      const keepsParent: boolean = await this.keepsParent(store, root, members);
      await this.requireDeletionDone(store, organizationId, entry.listId);
      const restoration: DeletedListRestoration = await this.spaces.restoreDeletedList(
        organizationId,
        viewer,
        entry.listId,
      );
      if (restoration.outcome !== 'restored') {
        throw new TaskRefusal({ reason: 'trash-entry-not-found' });
      }
      if (restoration.listRestored) {
        // The list was read live before, and deleted since: RestoreDeletedList now holds it.
        await this.refuseWhilePending(store, organizationId, entry.listId);
      }
      const now: Date = await store.clock.now();
      const by: TaskActor = { type: 'user', id: input.actorUserId };
      const rootId: string = root.snapshot.id;
      const restored: readonly Task[] = members.map((member: Task): Task =>
        member.restoreFromTrash(now, !keepsParent && member.snapshot.id === rootId),
      );
      const restoredRoot: Task | undefined = restored.find(
        (member: Task): boolean => member.snapshot.id === rootId,
      );
      if (restoredRoot === undefined) {
        throw new Error(`The restoration of ${entry.id} lost its root.`);
      }
      const rearchived: ReadonlyMap<string, Task> = new Map(
        restored
          .filter((member: Task): boolean => member.snapshot.archive !== null)
          .map((member: Task): [string, Task] => [member.snapshot.id, member.rearchive(by, now)]),
      );
      await store.tasks.writeTrash(
        organizationId,
        [entry.id],
        restored.map((member: Task, index: number): TrashTaskWrite => ({
          task: rearchived.get(member.snapshot.id) ?? member,
          versionBefore: members[index]?.snapshot.version ?? member.snapshot.version - 1,
        })),
      );
      await store.trash.remove(organizationId, entry.id);
      const actor: EventActor = { type: by.type, id: by.id };
      await this.announcer.restored(
        store.events,
        restoredRoot,
        restored,
        entry.id,
        actor,
        rearchived,
        await this.archiveRootKeysOf(store, organizationId, restored),
      );
      return {
        task: await this.answered(store, restoredRoot),
        list: await this.listOf(organizationId, viewer, entry.listId),
        subtaskCount: subtaskCountOf(restored.length),
        // A root deleted as a subtask whose parent was erased meanwhile (the erasure detached it)
        // left that parent too: ", détachée de son parent supprimé".
        detached: !keepsParent || (entry.parentKey !== null && root.snapshot.parentId === null),
        listRestored: restoration.listRestored,
        spaceRestored: restoration.spaceRestored,
      };
    });
  }

  /**
   * Method keepsParent
   *
   * @description
   * Decides whether the root keeps its parent. The parent is read first without a lock
   * (`references`): in the trash, the root is detached and the parent never locked. Out of it,
   * the parent is locked after the tasks of the entry, reading only whether it is live, in the
   * trash and its list (`lockStanding`), and checked again: in the trash by then, the root is
   * detached. An archived root keeps a parent of its list out of the trash, live or archived (it
   * shows it), and leaves any other. A live root asks the domain whether the parent takes it back
   * (`takesRestoredRoot`), from its standing, its level and its live subtasks read under that
   * lock, and the height of the live tasks of the entry from their parent links (`treeHeight`: the
   * archived ones come back in their archives and count towards no limit).
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} root - The root of the entry, locked.
   * @param {readonly Task[]} members - The tasks of the entry, locked.
   * @returns {Promise<boolean>} `true` when the root keeps its parent or has none.
   * @throws {Error} When the parent is missing, a defect the foreign key prevents.
   */
  private async keepsParent(
    store: TasksStore,
    root: Task,
    members: readonly Task[],
  ): Promise<boolean> {
    const { organizationId, parentId, listId, id, archive } = root.snapshot;
    if (parentId === null) {
      return true;
    }
    const seen: TaskReferenceInListView | undefined = (
      await store.reader.references(organizationId, [parentId])
    ).get(parentId);
    if (seen === undefined) {
      throw new Error(`The parent ${parentId} of the task ${id} in the trash is missing.`);
    }
    if (seen.inTrash) {
      return false;
    }
    const parent: TaskStanding | null = await store.tasks.lockStanding(organizationId, parentId);
    if (parent === null) {
      throw new Error(`The parent ${parentId} of the task ${id} in the trash is missing.`);
    }
    if (parent.inTrash) {
      return false;
    }
    if (archive !== null) {
      return parent.listId === listId;
    }
    const level: number = await store.tasks.levelOf(organizationId, parentId);
    const childCount: number = await store.tasks.childCount(organizationId, parentId);
    return takesRestoredRoot(
      { live: parent.live, listId: parent.listId, level, childCount },
      listId,
      treeHeight(
        id,
        members
          .map((member: Task): TaskState => member.snapshot)
          .filter((state: TaskState): boolean => state.archive === null),
      ),
    );
  }

  /**
   * Method requireDeletionDone
   *
   * @description
   * Locks the list of the entry when it is deleted (`LockDeletedList`) and, under that lock,
   * refuses the restoration while the list still holds a task out of the trash: the deletion job of
   * the list has not moved it yet, and a restoration would expose it. A live list, and an unknown
   * one (which `RestoreDeletedList` refuses), pass.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list of the entry.
   * @returns {Promise<void>} Resolves when the restoration may go on.
   * @throws {TaskRefusal} `trash-entry-not-found` while the deletion job of the list is not done.
   */
  private async requireDeletionDone(
    store: TasksStore,
    organizationId: string,
    listId: string,
  ): Promise<void> {
    const locked: LockedDeletedList = await this.spaces.lockDeletedList(organizationId, listId);
    if (locked.outcome === 'deleted') {
      await this.refuseWhilePending(store, organizationId, listId);
    }
  }

  /**
   * Method refuseWhilePending
   *
   * @description
   * Refuses the restoration while the list, which the caller holds locked (`LockDeletedList`, or
   * `RestoreDeletedList` for a list it brought back), still holds a task out of the trash: the work
   * the deletion job of the list has not done yet. The refusal rolls back everything the
   * transaction wrote, the list and space brought back and their events included.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list of the entry, locked.
   * @returns {Promise<void>} Resolves when no task of the list is out of the trash.
   * @throws {TaskRefusal} `trash-entry-not-found` otherwise.
   */
  private async refuseWhilePending(
    store: TasksStore,
    organizationId: string,
    listId: string,
  ): Promise<void> {
    const pending: ReadonlySet<string> = await store.tasks.listsWithUntrashedTasks(organizationId, [
      listId,
    ]);
    if (pending.has(listId)) {
      throw new TaskRefusal({ reason: 'trash-entry-not-found' });
    }
  }

  /**
   * Method archiveRootKeysOf
   *
   * @description
   * The key of the root of each archive a restored member is in, for its `task.archived.v1`: from
   * the members, and for a root outside the entry from one read of the references.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly Task[]} restored - The tasks of the entry, restored.
   * @returns {Promise<ReadonlyMap<string, TaskKey>>} The keys, by the id of the root.
   */
  private async archiveRootKeysOf(
    store: TasksStore,
    organizationId: string,
    restored: readonly Task[],
  ): Promise<ReadonlyMap<string, TaskKey>> {
    const keys = new Map<string, TaskKey>(
      restored.map((member: Task): [string, TaskKey] => [member.snapshot.id, member.snapshot.key]),
    );
    const outside: readonly string[] = [
      ...new Set(
        restored.flatMap((member: Task): string[] =>
          member.snapshot.archive === null ? [] : [member.snapshot.archive.rootId],
        ),
      ),
    ].filter((rootId: string): boolean => !keys.has(rootId));
    if (outside.length > 0) {
      const references: ReadonlyMap<string, TaskReferenceInListView> =
        await store.reader.references(organizationId, outside);
      for (const [rootId, reference] of references) {
        keys.set(rootId, TaskKey.parse(reference.key));
      }
    }
    return keys;
  }

  /**
   * Method answered
   *
   * @description
   * Reads the restored root again by key, with its checklist, and builds its view.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} root - The restored root, as written.
   * @returns {Promise<TaskView>} The view of the root.
   * @throws {Error} When the root cannot be read again, a defect.
   */
  private async answered(store: TasksStore, root: Task): Promise<TaskView> {
    const { organizationId, key, id } = root.snapshot;
    const read: Task | null = await store.tasks.findByKey(organizationId, key, false);
    if (read === null) {
      throw new Error(`The restored root ${id} cannot be read again.`);
    }
    return this.views.build(store.reader, read);
  }

  /**
   * Method listOf
   *
   * @description
   * Reads the list the entry came back to, visible again, with the role of the actor.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<PlacedList>} The list.
   * @throws {Error} When the list is not visible after its restoration, a defect.
   */
  private async listOf(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<PlacedList> {
    const placement: ListPlacement | null = await this.spaces.findVisibleList(
      organizationId,
      viewer,
      listId,
    );
    if (placement === null) {
      throw new Error(`The list ${listId} of a restored entry is not visible.`);
    }
    return placement.list;
  }
  // #endregion
}
