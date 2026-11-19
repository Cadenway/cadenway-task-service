import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import {
  archiveHeight,
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
import type { UnarchiveTaskInput } from './unarchive-task.input.js';
import type { UnarchiveTaskOutput } from './unarchive-task.output.js';

/**
 * How many times the task of the path is located and its archive locked: a restoration of the
 * same archive through another member that commits while this one waits makes the archive empty,
 * and the task is read again (it is live then, or in a new archive). More is a defect.
 */
const MAX_ATTEMPTS: number = 3;

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
 * UPDATE` in one statement ordered by id (at most 651 tasks), so a restoration of the same archive
 * through another member waits and finds it restored; `If-Match` is checked on the locked task.
 * Then the parent of the root is locked and read: the root keeps it only when the domain says the
 * parent takes it back (`takesRestoredRoot`: live, in the list of the root, fewer than 25 live
 * subtasks, its level plus the height of the archive 3 at most), and is detached otherwise. An
 * archived list is restored by the spaces module, which locks it and appends
 * `list.unarchived.v1`, before the tasks; a refusal of the list (unseen, or without `edit`, after a
 * concurrent change of its grants) answers `task-not-found` or `role-insufficient`. Lock order:
 * the membership of the actor, the members, the parent, the list.
 *
 * Every member gets back to live with its next version and `updatedAt`, in one statement; then
 * one `task.unarchived.v1` per member, the root first, then by depth and id, with the key of the
 * root. A restoration is not recorded in the activity log. The answer is the root.
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
   * @throws {Error} When the archive has no root, its root is not in the list of the task, or the
   * task keeps changing archive: defects.
   */
  public async execute(input: UnarchiveTaskInput): Promise<UnarchiveTaskOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<UnarchiveTaskOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
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
          this.checkVersion(task, input.expectedVersions);
          return this.views.build(store.reader, task);
        }
        const restored: Task | null = await this.restore(
          store,
          viewer,
          input,
          task,
          placement,
          archive,
        );
        if (restored !== null) {
          return this.views.build(store.reader, restored);
        }
      }
      throw new Error(
        `The archive of the task ${input.taskKey} kept changing while it was locked.`,
      );
    });
  }

  /**
   * Method restore
   *
   * @description
   * Locks the members of the archive and restores them, or tells the caller to read the task
   * again when the archive was restored meanwhile.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {UnarchiveTaskInput} input - The request.
   * @param {Task} task - The task of the path, as read without a lock.
   * @param {ListPlacement} placement - The list of the task of the path, as the actor sees it.
   * @param {TaskArchive} archive - The archive the task was read in.
   * @returns {Promise<Task | null>} The root, restored; `null` when the task of the path is no
   * longer in that archive.
   * @throws {TaskRefusal} `version-mismatch`, `task-not-found` or `role-insufficient`.
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
    const members: readonly Task[] = await store.tasks.lockArchive(organizationId, archive.rootId);
    const located: Task | undefined = members.find(
      (member: Task): boolean => member.snapshot.id === task.snapshot.id,
    );
    if (located === undefined) {
      return null;
    }
    this.checkVersion(located, input.expectedVersions);
    const root: Task | undefined = members.find(
      (member: Task): boolean => member.snapshot.id === archive.rootId,
    );
    if (root === undefined) {
      throw new Error(`The archive of ${archive.rootId} has no root.`);
    }
    if (root.snapshot.listId !== placement.list.id) {
      throw new Error(
        `The root of the archive ${archive.rootId} is not in the list of its members.`,
      );
    }
    const keepsParent: boolean = await this.keepsParent(store, root, members);
    if (placement.list.archivedAt !== null) {
      await this.restoreList(organizationId, viewer, placement.list.id);
    }
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
    await store.tasks.writeArchives(organizationId, restored);
    const actor: EventActor = { type: 'user', id: input.actorUserId };
    await this.announcer.unarchived(store.events, restoredRoot, restored, actor);
    return restoredRoot;
  }

  /**
   * Method keepsParent
   *
   * @description
   * Locks the parent of the root after the members and asks the domain whether it takes the root
   * back (`takesRestoredRoot`), from its archive, its list, its level and its live subtasks read
   * under that lock and the height of the archive.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} root - The root of the archive, locked.
   * @param {readonly Task[]} members - The members of the archive, locked.
   * @returns {Promise<boolean>} `true` when the root keeps its parent or has none.
   * @throws {Error} When the parent is missing, a defect the foreign key prevents.
   */
  private async keepsParent(
    store: TasksStore,
    root: Task,
    members: readonly Task[],
  ): Promise<boolean> {
    const { organizationId, parentId, listId, id } = root.snapshot;
    if (parentId === null) {
      return true;
    }
    const [parent] = await store.tasks.lockByIds(organizationId, [parentId]);
    if (parent === undefined) {
      throw new Error(`The parent ${parentId} of the archived task ${id} is missing.`);
    }
    const level: number = await store.tasks.levelOf(organizationId, parentId);
    const childCount: number = await store.tasks.childCount(organizationId, parentId);
    return takesRestoredRoot(
      {
        live: parent.snapshot.archive === null,
        listId: parent.snapshot.listId,
        level,
        childCount,
      },
      listId,
      archiveHeight(
        id,
        members.map((member: Task): TaskState => member.snapshot),
      ),
    );
  }

  /**
   * Method restoreList
   *
   * @description
   * Restores the archived list of the root through the spaces module, which appends
   * `list.unarchived.v1` before the events of the tasks.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<void>} Resolves once restored, or when it was live already.
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

  /**
   * Method checkVersion
   *
   * @description
   * The `If-Match` check of the task of the path.
   *
   * @param {Task} task - The task, as read.
   * @param {readonly number[] | null} expectedVersions - The versions `If-Match` accepts.
   * @throws {TaskRefusal} `version-mismatch` with the stored version.
   */
  private checkVersion(task: Task, expectedVersions: readonly number[] | null): void {
    const { version } = task.snapshot;
    if (expectedVersions !== null && !expectedVersions.includes(version)) {
      throw new TaskRefusal({ reason: 'version-mismatch', version });
    }
  }
  // #endregion
}
