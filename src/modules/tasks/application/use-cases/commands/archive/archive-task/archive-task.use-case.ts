import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { LocateRequest } from '../../../../models/task/locate-request.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { LockedSubtree } from '../../../../models/task/locked-subtree.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskAnnouncer } from '../../../../services/task/task-announcer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { TaskSubtreeLocker } from '../../../../services/task/task-subtree-locker.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { ArchiveTaskInput } from './archive-task.input.js';
import type { ArchiveTaskOutput } from './archive-task.output.js';

/** Releases the tree locks before retrying a changed tree. */
class RetryArchiveTree extends Error {}

/**
 * Class ArchiveTask
 *
 * @description
 * Archives a task the actor sees with its live subtasks at every level, whatever their status
 * (`POST /internal/v1/tasks/{taskKey}/archive`; "Tasks" of `openapi/public/archives.yaml`). The
 * actor needs `edit` on the list of the task. Refusals in order: `task-not-found`,
 * `role-insufficient`, `version-mismatch` (`If-Match` on the task); a task archived already then
 * answers its stored version and writes and emits nothing, and a subtask archived before keeps its
 * own archive (it is not live, so it is not taken). Locks follow the order of the module: the
 * membership of the actor, the live tree in ascending id (`TaskSubtreeLocker`), then its space
 * and list, under which the role is checked again. The live members are archived without their
 * checklists, which an archive never writes or emits. Every
 * task taken gets the same archive (the transaction instant, the actor, the root), its next
 * version and `updatedAt`, written in one statement; then one `task.archived.v1` per task, the
 * root first, then by depth and id, with the key of the root. An archive is not recorded in the
 * activity log. The answer is the root, archived (with its checklist, read with it by key), with
 * the subtasks archived with it as its subtask counts.
 */
export class ArchiveTask {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Locks the live descendants. */
  private readonly subtrees: TaskSubtreeLocker;

  /** Locks the placement and checks the current role. */
  private readonly spaces: SpaceDirectory;

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
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
    this.subtrees = new TaskSubtreeLocker();
    this.spaces = spaces;
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
   * Archives the task and its live subtree.
   *
   * @param {ArchiveTaskInput} input - The actor, the task and the versions `If-Match` accepts.
   * @returns {Promise<ArchiveTaskOutput>} The task, archived.
   * @throws {TaskRefusal} `organization-not-found`, `task-not-found`, `role-insufficient` or
   * `version-mismatch`.
   * @throws {Error} When the live subtree is larger than a valid one or keeps changing while it is
   * locked, or a task vanished or changed version under its lock: defects.
   */
  public async execute(input: ArchiveTaskInput): Promise<ArchiveTaskOutput> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.unitOfWork.run(async (store: TasksStore): Promise<ArchiveTaskOutput> => {
          const { organizationId } = input;
          const viewer: Viewer = await this.viewers.resolve(
            organizationId,
            input.actorUserId,
            true,
          );
          const request: LocateRequest = {
            organizationId,
            viewer,
            taskKey: input.taskKey,
            edit: true,
            lock: false,
            archived: 'allow',
            expectedVersions: input.expectedVersions,
          };
          const located: LocatedTask = await this.locator.locate(store, request);
          if (!located.task.isLive) {
            const current = await this.locator.locate(store, { ...request, lock: true });
            if (current.task.isLive) throw new RetryArchiveTree();
            return this.views.build(store.reader, current.task);
          }
          const subtree: LockedSubtree = await this.subtrees.lock(
            store,
            located.task,
            [],
            false,
            true,
          );
          const root: Task | undefined = subtree.tasks.find(
            (candidate: Task): boolean => candidate.snapshot.id === located.task.snapshot.id,
          );
          if (root === undefined) {
            await this.locator.locate(store, request);
            throw new RetryArchiveTree();
          }
          const [list] = await this.spaces.lockTrashLists(
            organizationId,
            [root.snapshot.listId],
            'hold',
            viewer,
          );
          if (list?.outcome !== 'live' || list.role === null) {
            throw new TaskRefusal({ reason: 'task-not-found' });
          }
          if (!canWriteTasksOf(list.role)) {
            throw new TaskRefusal({ reason: 'role-insufficient', role: list.role });
          }
          const { task }: LocatedTask = await this.locator.confirm(store, request, root);
          if (!task.isLive) {
            const withChecklist: LocatedTask = await this.locator.locate(store, request);
            return this.views.build(store.reader, withChecklist.task);
          }
          const now: Date = await store.clock.now();
          const by: TaskActor = { type: 'user', id: input.actorUserId };
          const rootId: string = task.snapshot.id;
          const archived: readonly Task[] = subtree.tasks
            .filter(
              (member: Task): boolean =>
                member.snapshot.id === task.snapshot.id ||
                subtree.shape.descendantIds.includes(member.snapshot.id),
            )
            .map((member: Task): Task =>
              this.rules.apply((): Task => member.archive(rootId, by, now)),
            );
          const archivedRoot: Task | undefined = archived.find(
            (member: Task): boolean => member.snapshot.id === rootId,
          );
          if (archivedRoot === undefined) {
            throw new Error(`The archive of the task ${rootId} lost its root.`);
          }
          await store.tasks.writeArchives(organizationId, rootId, archived);
          const actor: EventActor = { type: 'user', id: input.actorUserId };
          await this.announcer.archived(store.events, archivedRoot, archived, actor);
          const answer: LocatedTask = await this.locator.locate(store, {
            ...request,
            expectedVersions: null,
          });
          return this.views.build(store.reader, answer.task);
        });
      } catch (error: unknown) {
        if (!(error instanceof RetryArchiveTree)) {
          throw error;
        }
      }
    }
    throw new Error(`The task ${input.taskKey} kept leaving its tree while it was locked.`);
  }
  // #endregion
}
