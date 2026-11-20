import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import {
  treeHeight,
  takesRestoredRoot,
} from '../../../../../domain/policies/subtask/subtask-tree.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskArchive } from '../../../../../domain/value-objects/task/task-archive.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { ListRestoration } from '../../../../models/placement/list-restoration.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskAnnouncer } from '../../../../services/task/task-announcer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import { TrashTreeLocker } from '../../../../services/trash/trash-tree-locker.service.js';
import type { UnarchiveTaskInput } from './unarchive-task.input.js';
import type { UnarchiveTaskOutput } from './unarchive-task.output.js';

/**
 * How many times the task of the path is located and its archive locked: a restoration of the
 * same archive through another member that commits while this one waits makes the archive empty,
 * and an archive restored, moved and archived again meanwhile is in another list; either way the
 * task is read again (it is live then, or in a new archive, whose list is checked again). More is
 * a defect.
 */
const MAX_ATTEMPTS: number = 3;

/** Releases locks before trying a changed archive again. */
class RetryArchive extends Error {}

/**
 * Class UnarchiveTask
 *
 * @description
 * Restores the archive a task belongs to, from its root (`POST
 * /internal/v1/tasks/{taskKey}/unarchive`; "Tasks" of `openapi/public/archives.yaml`: "Restoring
 * any task of an archive restores the whole archive, from its root, to its list, which is
 * restored too when it is archived"). The actor needs `edit` on the list of the task.
 *
 * The task of the path is located without a lock (`task-not-found`, then `role-insufficient`).
 * Not archived, `If-Match` is checked on its version (`version-mismatch`) and it answers as it is,
 * writing and emitting nothing. Archived, every member of its archive is locked `FOR NO KEY
 * UPDATE` together with the root's parent in one statement ordered by id, so a restoration of the same archive
 * through another member waits and finds it restored; `If-Match` is checked on the locked task.
 * The members are locked without their checklists, which a restoration never writes or emits. A
 * root that is no longer in the list of the task located (the archive was restored, moved and
 * archived again meanwhile) is a changed archive: the task is located again, so the role is
 * checked on its list as it is now, before `If-Match`. The root keeps its locked parent only when the domain says the parent
 * takes it back (`takesRestoredRoot`: live, in the list of the root, fewer than 25 live subtasks,
 * its level plus the height of the archive 3 at most), and is detached otherwise. The list of the
 * root always goes to the spaces module (`RestoreArchivedList`), which locks it and decides on the
 * locked list: an archived one is restored, appending `list.unarchived.v1` before the tasks; a
 * live one answers `not-archived`. A refusal of the list (unseen, or without `edit`, after a
 * concurrent change of its grants) answers `task-not-found` or `role-insufficient`. Lock order:
 * the membership of the actor, the members and parent together, the space, the list.
 *
 * Every member gets back to live with its next version and `updatedAt`, in one statement; then
 * one `task.unarchived.v1` per member, the root first, then by depth and id, with the key of the
 * root. A restoration is not recorded in the activity log. The answer is the root, read again by
 * its key after the write, with its checklist.
 */
export class UnarchiveTask {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module, to restore an archived list. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Locks a live tree when the path is not archived. */
  private readonly trees: TrashTreeLocker;

  /** Maps the refusals of the domain. */
  private readonly rules: TaskRuleGuard;

  /** Appends the events. */
  private readonly announcer: TaskAnnouncer;

  /** Builds the view of the task. */
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
    this.locator = new TaskLocator(spaces);
    this.trees = new TrashTreeLocker();
    this.rules = new TaskRuleGuard();
    this.announcer = new TaskAnnouncer();
    this.views = new TaskViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Restores the archive of the task.
   *
   * @param {UnarchiveTaskInput} input - The actor, the task and the versions `If-Match` accepts.
   * @returns {Promise<UnarchiveTaskOutput>} The root of the archive, restored, or the task of the
   * path when it was not archived.
   * @throws {TaskRefusal} `organization-not-found`, `task-not-found`, `role-insufficient` or
   * `version-mismatch`.
   * @throws {Error} When the archive has no root, the restored root cannot be read again, or the
   * task keeps changing archive: defects.
   */
  public async execute(input: UnarchiveTaskInput): Promise<UnarchiveTaskOutput> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.unitOfWork.run(
          async (store: TasksStore): Promise<UnarchiveTaskOutput> => {
            const viewer: Viewer = await this.viewers.resolve(
              input.organizationId,
              input.actorUserId,
              true,
            );
            const { task, placement }: LocatedTask = await this.locator.locate(store, {
              organizationId: input.organizationId,
              viewer,
              taskKey: input.taskKey,
              edit: true,
              lock: false,
              archived: 'allow',
              expectedVersions: null,
            });
            const { archive } = task.snapshot;
            if (archive === null) {
              const tree = (
                await this.trees.lock(
                  store,
                  input.organizationId,
                  [task.snapshot.id],
                  [],
                  Infinity,
                  [],
                  true,
                )
              ).trees[0];
              if (tree?.root.snapshot.archive !== null) throw new RetryArchive();
              const [list] = await this.spaces.lockTrashLists(
                input.organizationId,
                [tree.root.snapshot.listId],
                'hold',
                viewer,
              );
              if (list?.outcome !== 'live' || list.role === null)
                throw new TaskRefusal({ reason: 'task-not-found' });
              if (!canWriteTasksOf(list.role))
                throw new TaskRefusal({ reason: 'role-insufficient', role: list.role });
              const confirmed = await this.locator.confirm(
                store,
                {
                  organizationId: input.organizationId,
                  viewer,
                  taskKey: input.taskKey,
                  edit: true,
                  lock: false,
                  archived: 'allow',
                  expectedVersions: input.expectedVersions,
                },
                tree.root,
              );
              return this.views.build(store.reader, confirmed.task);
            }
            const restored: Task | null = await this.restore(
              store,
              viewer,
              input,
              task,
              placement,
              archive,
            );
            if (restored === null) throw new RetryArchive();
            return this.views.build(store.reader, restored);
          },
        );
      } catch (error: unknown) {
        if (!(error instanceof RetryArchive)) throw error;
      }
    }
    throw new Error(`The archive of the task ${input.taskKey} kept changing while it was locked.`);
  }

  /**
   * Method restore
   *
   * @description
   * Locks the members of the archive and restores them, or tells the caller to read the task
   * again when the archive changed meanwhile: restored (the task of the path is no longer in it),
   * or restored, moved and archived again (its root is no longer in the list of the task located).
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {UnarchiveTaskInput} input - The request.
   * @param {Task} task - The task of the path, as read without a lock.
   * @param {ListPlacement} placement - The list of the task of the path, as the actor sees it.
   * @param {TaskArchive} archive - The archive the task was read in.
   * @returns {Promise<Task | null>} The root, restored, as stored after the write; `null` when the
   * archive changed.
   * @throws {TaskRefusal} `version-mismatch`, `task-not-found` or `role-insufficient`.
   * @throws {Error} When the archive has no root, or the restored root cannot be read again.
   */
  private async restore(
    store: TasksStore,
    viewer: Viewer,
    input: UnarchiveTaskInput,
    task: Task,
    placement: ListPlacement,
    archive: TaskArchive,
  ): Promise<Task | null> {
    const { organizationId } = input;
    const locked: readonly Task[] = await store.tasks.lockArchive(organizationId, archive.rootId);
    const members: readonly Task[] = locked.filter(
      (member: Task): boolean =>
        member.snapshot.archive?.rootId === archive.rootId && !member.isInTrash,
    );
    const located: Task | undefined = members.find(
      (member: Task): boolean => member.snapshot.id === task.snapshot.id,
    );
    if (located === undefined) {
      return null;
    }
    const root: Task | undefined = members.find(
      (member: Task): boolean => member.snapshot.id === archive.rootId,
    );
    if (root === undefined) {
      throw new Error(`The archive of ${archive.rootId} has no root.`);
    }
    if (root.snapshot.listId !== placement.list.id) {
      return null;
    }
    const keepsParent: boolean = await this.keepsParent(store, root, members, locked);
    await this.restoreList(organizationId, viewer, placement.list.id);
    this.locator.requireVersion(located, input.expectedVersions);
    const now: Date = await store.clock.now();
    const rootId: string = root.snapshot.id;
    const restored: readonly Task[] = members.map((member: Task): Task =>
      this.rules.apply((): Task =>
        member.unarchive(now, !keepsParent && member.snapshot.id === rootId),
      ),
    );
    const restoredRoot: Task | undefined = restored.find(
      (member: Task): boolean => member.snapshot.id === rootId,
    );
    if (restoredRoot === undefined) {
      throw new Error(`The restoration of ${rootId} lost its root.`);
    }
    await store.tasks.writeArchives(organizationId, rootId, restored);
    const actor: EventActor = { type: 'user', id: input.actorUserId };
    await this.announcer.unarchived(store.events, restoredRoot, restored, actor);
    const answered: Task | null = await store.tasks.findByKey(
      organizationId,
      restoredRoot.snapshot.key,
      false,
    );
    if (answered === null) {
      throw new Error(`The restored root ${rootId} cannot be read again.`);
    }
    return answered;
  }

  /**
   * Method keepsParent
   *
   * @description
   * Uses the parent locked with the archive members and asks the domain whether it takes
   * the root back (`takesRestoredRoot`), from those, its level and its live subtasks read under
   * that lock, and the height of the archive.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} root - The root of the archive, locked.
   * @param {readonly Task[]} members - The members of the archive, locked.
   * @param {readonly Task[]} locked - The archive members and parent locked together.
   * @returns {Promise<boolean>} `true` when the root keeps its parent or has none.
   * @throws {Error} When the parent is missing, a defect the foreign key prevents.
   */
  private async keepsParent(
    store: TasksStore,
    root: Task,
    members: readonly Task[],
    locked: readonly Task[],
  ): Promise<boolean> {
    const { organizationId, parentId, listId, id } = root.snapshot;
    if (parentId === null) {
      return true;
    }
    const parent: Task | undefined = locked.find(
      (candidate: Task): boolean => candidate.snapshot.id === parentId,
    );
    if (parent === undefined) {
      throw new Error(`The parent ${parentId} of the archived task ${id} is missing.`);
    }
    const level: number = await store.tasks.levelOf(organizationId, parentId);
    const childCount: number = await store.tasks.childCount(organizationId, parentId);
    return takesRestoredRoot(
      { live: parent.isLive, listId: parent.snapshot.listId, level, childCount },
      listId,
      treeHeight(
        id,
        members.map((member: Task): TaskState => member.snapshot),
      ),
    );
  }

  /**
   * Method restoreList
   *
   * @description
   * Hands the list of the root to the spaces module, which locks it and restores it when it is
   * archived (appending `list.unarchived.v1` before the events of the tasks) or answers
   * `not-archived`: the decision is made on the locked list, not on the list read before.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<void>} Resolves once restored, or when it was live.
   * @throws {TaskRefusal} `task-not-found` when the actor no longer has a role on the list,
   * `role-insufficient` when they no longer have `edit` on it.
   */
  private async restoreList(organizationId: string, viewer: Viewer, listId: string): Promise<void> {
    const restoration: ListRestoration = await this.spaces.restoreArchivedList(
      organizationId,
      viewer,
      listId,
    );
    if (restoration.outcome === 'not-found') {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    if (restoration.outcome === 'role-insufficient') {
      throw new TaskRefusal({ reason: 'role-insufficient', role: restoration.role });
    }
  }
  // #endregion
}
