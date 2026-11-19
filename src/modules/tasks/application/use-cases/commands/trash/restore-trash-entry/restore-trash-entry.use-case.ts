import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import {
  takesRestoredRoot,
  treeHeight,
} from '../../../../../domain/policies/subtask/subtask-tree.policy.js';
import { subtaskCountOf } from '../../../../../domain/policies/trash/trash-entry.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { DeletedListRestoration } from '../../../../models/placement/deleted-list-restoration.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TaskStanding } from '../../../../models/task/task-standing.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TrashEntryRecord } from '../../../../models/trash/trash-entry-record.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
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
 * (`lockTrashEntries`), without their checklists; the parent of a live root by one lean
 * statement (`lockStanding`: live means in no archive and not in the trash); then the list and its
 * space through the spaces module (`RestoreDeletedList`, always called, which decides on the
 * locked rows and brings back a deleted space and list, appending `space.restored.v1` and
 * `list.restored.v1` first; a refusal of it answers `trash-entry-not-found`).
 *
 * A live root keeps its parent only when the domain says the parent takes it back
 * (`takesRestoredRoot`: live, in its list, fewer than 25 live subtasks, its level plus the height
 * of the live tasks of the entry 3 at most), and is detached otherwise (", détachée de son parent
 * supprimé"); an archived root (top-level by construction: its entry was made by the deletion of
 * its list) has no parent to keep and is never detached. Every task leaves the trash with its
 * archive as it was (an archived task comes back archived, in its archive, so the 25-subtask and
 * 3-level limits hold: archived subtasks do not count towards them), its next version and
 * `updatedAt`, in one statement, and the entry row is deleted; then one `task.restored.v1` per
 * task, the root first, then by depth and id, with the id of the locked entry. An archived list
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
   * @throws {Error} When the entry has no task or no root, the parent of the root is missing, or
   * the restored root or its list cannot be read again: defects.
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
      const restoration: DeletedListRestoration = await this.spaces.restoreDeletedList(
        organizationId,
        viewer,
        entry.listId,
      );
      if (restoration.outcome !== 'restored') {
        throw new TaskRefusal({ reason: 'trash-entry-not-found' });
      }
      const now: Date = await store.clock.now();
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
      await store.tasks.writeTrash(organizationId, [entry.id], restored);
      await store.trash.remove(organizationId, entry.id);
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      await this.announcer.restored(store.events, restoredRoot, restored, entry.id, actor);
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
   * Locks the parent of a live root after the tasks of the entry, reading only whether it is live
   * and its list (`lockStanding`), and asks the domain whether it takes the root back
   * (`takesRestoredRoot`), from those, its level and its live subtasks read under that lock, and
   * the height of the live tasks of the entry from their parent links (`treeHeight`: the archived
   * ones come back in their archives and count towards no limit). An archived root keeps what it
   * has: it is never detached.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} root - The root of the entry, locked.
   * @param {readonly Task[]} members - The tasks of the entry, locked.
   * @returns {Promise<boolean>} `true` when the root keeps its parent, has none or is archived.
   * @throws {Error} When the parent is missing, a defect the foreign key prevents.
   */
  private async keepsParent(
    store: TasksStore,
    root: Task,
    members: readonly Task[],
  ): Promise<boolean> {
    const { organizationId, parentId, listId, id, archive } = root.snapshot;
    if (parentId === null || archive !== null) {
      return true;
    }
    const parent: TaskStanding | null = await store.tasks.lockStanding(organizationId, parentId);
    if (parent === null) {
      throw new Error(`The parent ${parentId} of the task ${id} in the trash is missing.`);
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
