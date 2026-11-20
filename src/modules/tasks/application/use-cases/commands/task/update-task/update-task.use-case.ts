import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { ScheduledTaskUpdate } from '../../../../models/task/scheduled-task-update.model.js';
import type { PlannedChange } from '../../../../models/placement/planned-change.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { LockedSubtree } from '../../../../models/task/locked-subtree.model.js';
import type { LocateRequest } from '../../../../models/task/locate-request.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { WatcherAudienceChanged } from '../../../../models/watcher/watcher-audience-changed.model.js';
import { TaskOccurrenceScheduler } from '../../../../services/task/task-occurrence-scheduler.service.js';
import { VisibleNextOccurrence } from '../../../../services/task/visible-next-occurrence.service.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskMovePlanner } from '../../../../services/task/task-move-planner.service.js';
import { DescriptionMentionGuard } from '../../../../services/mention/description-mention-guard.service.js';
import { appendDescriptionMentionChange } from '../../../../services/mention/description-mention-event.service.js';
import { TaskSubtreeLocker } from '../../../../services/task/task-subtree-locker.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import { EffectiveWatchers } from '../../../../services/watcher/effective-watchers.service.js';
import { withWatcherAudienceRetry } from '../../../../services/watcher/watcher-audience-retry.service.js';
import type { UpdateTaskInput } from './update-task.input.js';
import type { UpdateTaskOutput } from './update-task.output.js';

/** The task change and audience after its membership, task and placement locks are held. */
interface PreparedUpdate {
  // #region Properties
  /** Source task read from the locked row. */
  readonly task: Task;

  /** Locked descendants of a move or attachment. */
  readonly descendants: readonly Task[];

  /** Final task and changed fields. */
  readonly update: TaskUpdate;

  /** Placement and patch resolved under their locks. */
  readonly plan: PlannedChange;

  /** Viewer and assignee memberships held by the preflight. */
  readonly viewer: Viewer;
  readonly candidates: readonly AssigneeCandidate[];

  /** Transaction instant. */
  readonly now: Date;

  /** Effective status-change event audience. */
  readonly watcherIds: readonly string[];
  // #endregion
}

/** Releases task locks before retrying a changed moving tree. */
class RetryMoveTree extends Error {}

/**
 * Class UpdateTask
 *
 * @description
 * Patches a task the actor sees (`PATCH /internal/v1/tasks/{taskKey}`). Locks follow the order of
 * the module: the membership of the actor, then for a move or an attachment the task, its tree
 * and the new parent together in id order, followed by the spaces and lists. Visibility comes first
 * (`task-not-found`), then `edit` on the list of the task (`role-insufficient`), then the archive
 * (`task-archived`), then `If-Match` (`version-mismatch` with the stored version), then the target
 * of a move or an attach (`list-invalid`, `parent-invalid` when not seen, `role-insufficient` when
 * seen without `edit`, `task-archived` for an archived parent), then the domain, which decides every other rule (`Task.update`). A patch that changes nothing writes nothing, records nothing,
 * emits nothing and answers the stored version. A change writes the task, records the activity
 * entries of the status, priority and due date (merged by the coalescing policy) and appends
 * `task.updated.v1` (and `task.status-changed.v1`); every descendant that follows a move or an
 * attach changes list, version and `task.updated.v1` of its own; an archived subtask stays where it is. The parent of a subtask created,
 * attached or detached is not changed.
 */
export class UpdateTask {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Resolves the target of a move or an attach. */
  private readonly planner: TaskMovePlanner;

  /** Acquires a moving tree in the same order as trash. */
  private readonly trees: TaskSubtreeLocker;

  /** Checks placement under its space and list locks. */
  private readonly spaces: SpaceDirectory;

  /** Maps the refusals of the domain. */
  private readonly rules: TaskRuleGuard;

  /** Writes the changes. */
  private readonly writer: TaskChangeWriter;

  /** Creates recurring successors in the same transaction. */
  private readonly recurrence: TaskOccurrenceScheduler;

  /** Filters the successor reference for the viewer. */
  private readonly successor: VisibleNextOccurrence;

  /** Computes the status-change audience under the task and placement locks. */
  private readonly watchers: EffectiveWatchers;

  /** Locks and checks newly supplied description recipients. */
  private readonly descriptionMentions: DescriptionMentionGuard;

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
    this.planner = new TaskMovePlanner(spaces);
    this.trees = new TaskSubtreeLocker();
    this.spaces = spaces;
    this.rules = new TaskRuleGuard();
    this.descriptionMentions = new DescriptionMentionGuard(members, spaces);
    this.writer = new TaskChangeWriter();
    this.watchers = new EffectiveWatchers(members, spaces);
    this.recurrence = new TaskOccurrenceScheduler(spaces);
    this.successor = new VisibleNextOccurrence(spaces);
    this.views = new TaskViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Applies the patch.
   *
   * @param {UpdateTaskInput} input - The actor, the task, the versions `If-Match` accepts and the
   * patch.
   * @returns {Promise<UpdateTaskOutput>} The task after the patch.
   * @throws {TaskRefusal} `organization-not-found`, `task-not-found`, `role-insufficient`,
   * `task-archived` (the task, or after the 422 and 403 of the parent, an archived parent),
   * `version-mismatch`, `list-invalid`, `parent-invalid`, `subtask-depth-exceeded`,
   * `subtask-limit-reached`, `status-hidden`, `cancel-reason-required`,
   * `cancel-reason-unexpected` or `start-date-invalid`. `role-insufficient` also comes after
   * `version-mismatch`, for the list a move goes to or the list of the new parent.
   */
  public async execute(input: UpdateTaskInput): Promise<UpdateTaskOutput> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.unitOfWork.run((store) => this.apply(store, input));
      } catch (error: unknown) {
        if (!(error instanceof RetryMoveTree)) throw error;
      }
    }
    throw new Error(`The task ${input.taskKey} kept leaving its tree while it was locked.`);
  }

  /** Writes the prepared change, activity and events while the preflight's locks remain held. */
  private async apply(store: TasksStore, input: UpdateTaskInput): Promise<UpdateTaskOutput> {
    const prepare = (): Promise<PreparedUpdate> => this.prepare(store, input);
    const { task, descendants, plan, now, watcherIds, viewer, candidates } =
      input.patch.status === undefined
        ? await prepare()
        : await withWatcherAudienceRetry(store, prepare);
    const scheduled: ScheduledTaskUpdate = await this.recurrence.prepare(
      task,
      plan.patch,
      plan.statuses,
      now,
    );
    const update = scheduled.update;
    if (update.changed.length > 0) {
      await this.writer.commit(store, task, update, input.actorUserId, now, watcherIds);
      if (update.changed.includes('descriptionMentions')) {
        await appendDescriptionMentionChange(
          store.events,
          task.snapshot.descriptionMentions,
          update.task,
          {
            type: 'user',
            id: input.actorUserId,
          },
        );
      }
      if (update.changed.includes('listId') || update.changed.includes('spaceId')) {
        await this.moveDescendants(store, descendants, update.task, input, now);
      }
      await this.recurrence.createSuccessor(
        store,
        scheduled,
        plan.statuses,
        candidates,
        { type: 'user', id: input.actorUserId },
        now,
      );
    }
    const view = await this.views.build(store.reader, update.task);
    const nextOccurrenceKey = await this.successor.keyOf(store, update.task, viewer);
    return nextOccurrenceKey === undefined ? view : { ...view, nextOccurrenceKey };
  }

  /** Acquires the moving tree and any new parent before locking their placements. */
  private async locateMove(
    store: TasksStore,
    viewer: Viewer,
    request: LocateRequest,
    input: UpdateTaskInput,
  ): Promise<{ readonly located: LocatedTask; readonly subtree: LockedSubtree }> {
    const found: LocatedTask = await this.locator.locate(store, request);
    const { organizationId } = input;
    const targetId: string | undefined = input.patch.listId;
    if (targetId !== undefined && targetId !== found.task.snapshot.listId) {
      const target: ListPlacement | null = await this.spaces.findVisibleList(
        organizationId,
        viewer,
        targetId,
      );
      if (target === null) throw new TaskRefusal({ reason: 'list-invalid' });
      if (!canWriteTasksOf(target.list.callerRole))
        throw new TaskRefusal({ reason: 'role-insufficient', role: target.list.callerRole });
    }
    let parent: Task | null = null;
    if (typeof input.patch.parentKey === 'string') {
      const parentKey: string = input.patch.parentKey;
      try {
        parent = await store.tasks.findByKey(organizationId, TaskKey.parse(parentKey), false);
      } catch (error: unknown) {
        if (!(error instanceof InvalidTaskError)) throw error;
      }
      if (parent === null || parent.isInTrash)
        throw new TaskRefusal({ reason: 'parent-invalid', parentKey });
      const placement: ListPlacement | null = await this.spaces.findVisibleList(
        organizationId,
        viewer,
        parent.snapshot.listId,
      );
      if (placement === null) throw new TaskRefusal({ reason: 'parent-invalid', parentKey });
      if (!canWriteTasksOf(placement.list.callerRole))
        throw new TaskRefusal({ reason: 'role-insufficient', role: placement.list.callerRole });
    }
    const locked = await this.trees.lock(
      store,
      found.task,
      parent === null ? [] : [parent.snapshot.id],
      true,
      true,
    );
    const root: Task | undefined = locked.tasks.find(
      (candidate: Task): boolean => candidate.snapshot.id === found.task.snapshot.id,
    );
    if (root === undefined) {
      await this.locator.locate(store, request);
      throw new RetryMoveTree();
    }
    if (parent !== null) {
      parent =
        locked.tasks.find((task: Task): boolean => task.snapshot.id === parent?.snapshot.id) ??
        null;
      if (parent === null || parent.isInTrash)
        throw new TaskRefusal({ reason: 'parent-invalid', parentKey: input.patch.parentKey ?? '' });
    }
    const listIds: string[] = [
      root.snapshot.listId,
      ...(targetId === undefined ? [] : [targetId]),
      ...(parent === null ? [] : [parent.snapshot.listId]),
    ];
    const locks = await this.spaces.lockTrashLists(organizationId, listIds, 'hold', viewer);
    const source = locks.find((list) => list.listId === root.snapshot.listId);
    if (source?.outcome !== 'live' || source.role === null)
      throw new TaskRefusal({ reason: 'task-not-found' });
    if (!canWriteTasksOf(source.role))
      throw new TaskRefusal({ reason: 'role-insufficient', role: source.role });
    const confirmed: LocatedTask = await this.locator.confirm(store, request, root);
    for (const list of locks) {
      if (list.listId === root.snapshot.listId) continue;
      if (list.outcome !== 'live' || list.role === null) {
        if (parent !== null && list.listId === parent.snapshot.listId)
          throw new TaskRefusal({
            reason: 'parent-invalid',
            parentKey: input.patch.parentKey ?? '',
          });
        throw new TaskRefusal({ reason: 'list-invalid' });
      }
      if (!canWriteTasksOf(list.role))
        throw new TaskRefusal({ reason: 'role-insufficient', role: list.role });
    }
    return { located: confirmed, subtree: locked };
  }

  /** Acquires and verifies the write's locks before any task, activity or outbox write. */
  private async prepare(store: TasksStore, input: UpdateTaskInput): Promise<PreparedUpdate> {
    const viewer: Viewer = await this.viewers.resolve(
      input.organizationId,
      input.actorUserId,
      true,
    );
    const recipients = await this.descriptionMentions.lockRecipients(
      input.organizationId,
      viewer,
      input.patch.descriptionMentions ?? [],
    );
    const request: LocateRequest = {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: true,
      lock: false,
      archived: 'refuse',
      expectedVersions: input.expectedVersions,
    };
    const candidateTask =
      input.patch.status === undefined
        ? null
        : (
            await this.locator.locate(store, {
              ...request,
              lock: false,
              archived: 'allow',
              expectedVersions: null,
            })
          ).task;
    const heldRoles =
      candidateTask === null
        ? new Map<string, MemberRole | null>()
        : await this.watchers.holdCandidates(
            store,
            candidateTask.snapshot,
            viewer,
            input.patch.status === 'done' ? candidateTask.snapshot.assigneeIds : [],
          );
    const moving = input.patch.listId !== undefined || input.patch.parentKey !== undefined;
    const move = moving ? await this.locateMove(store, viewer, request, input) : null;
    const located: LocatedTask =
      move?.located ?? (await this.locator.locate(store, { ...request, lock: true }));
    const { task } = located;
    const plan: PlannedChange = await this.planner.plan(
      store,
      viewer,
      located,
      input.patch,
      move?.subtree ?? null,
    );
    const now: Date = await store.clock.now();
    const update: TaskUpdate = this.rules.apply((): TaskUpdate =>
      task.update(plan.patch, plan.statuses, now),
    );
    if (
      update.nextOccurrence !== undefined &&
      task.snapshot.assigneeIds.some((id) => !heldRoles.has(id))
    ) {
      throw new WatcherAudienceChanged();
    }
    const candidates: readonly AssigneeCandidate[] =
      update.nextOccurrence === undefined
        ? []
        : task.snapshot.assigneeIds.map((userId) => ({
            userId,
            role: heldRoles.get(userId) ?? null,
          }));
    const statusChanged = update.changed.includes('status');
    const { listId } = update.task.snapshot;
    if (move === null && (statusChanged || recipients.length > 0)) {
      await this.planner.holdPlacement(input.organizationId, viewer, listId);
    }
    if (recipients.length > 0) {
      await this.descriptionMentions.requireEligible(input.organizationId, listId, recipients);
    }
    const watcherIds = statusChanged
      ? await this.watchers.forHeldTask(store, update.task.snapshot, heldRoles)
      : [];
    return {
      task,
      descendants: plan.descendants,
      update,
      plan,
      viewer,
      candidates,
      now,
      watcherIds,
    };
  }

  /**
   * Method moveDescendants
   *
   * @description
   * Brings the descendants of a task that changed list to its list and space, each with its own
   * version and `task.updated.v1`.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {readonly Task[]} descendants - The locked descendants.
   * @param {Task} moved - The task after its move.
   * @param {UpdateTaskInput} input - The request, for the actor.
   * @param {Date} now - The transaction instant.
   * @returns {Promise<void>} Resolves once written.
   */
  private async moveDescendants(
    store: TasksStore,
    descendants: readonly Task[],
    moved: Task,
    input: UpdateTaskInput,
    now: Date,
  ): Promise<void> {
    const { listId, spaceId }: TaskState = moved.snapshot;
    for (const descendant of descendants) {
      const update: TaskUpdate = this.rules.apply((): TaskUpdate =>
        descendant.followMove({ listId, spaceId }, now),
      );
      await this.writer.commit(store, descendant, update, input.actorUserId, now);
    }
  }
  // #endregion
}
