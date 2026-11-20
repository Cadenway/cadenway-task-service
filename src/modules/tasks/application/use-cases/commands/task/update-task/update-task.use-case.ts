import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { PlannedChange } from '../../../../models/placement/planned-change.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { ScheduledTaskUpdate } from '../../../../models/task/scheduled-task-update.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { AssigneeChecker } from '../../../../services/member/assignee-checker.service.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskMovePlanner } from '../../../../services/task/task-move-planner.service.js';
import { TaskOccurrenceScheduler } from '../../../../services/task/task-occurrence-scheduler.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import { VisibleNextOccurrence } from '../../../../services/task/visible-next-occurrence.service.js';
import type { UpdateTaskInput } from './update-task.input.js';
import type { UpdateTaskOutput } from './update-task.output.js';

/**
 * Class UpdateTask
 *
 * @description
 * Patches a task the actor sees (`PATCH /internal/v1/tasks/{taskKey}`). Locks follow the order of
 * the module: the membership of the actor, the task `FOR NO KEY UPDATE`, then, for a move or an
 * attach, the new parent and the descendants in one ordered statement. Visibility comes first
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

  /** Holds the memberships of the assignees copied to a successor. */
  private readonly assignees: AssigneeChecker;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Resolves the target of a move or an attach. */
  private readonly planner: TaskMovePlanner;

  /** Maps the refusals of the domain. */
  private readonly rules: TaskRuleGuard;

  /** Writes the changes. */
  private readonly writer: TaskChangeWriter;

  /** Validates and creates an occurrence within this unit of work. */
  private readonly recurrence: TaskOccurrenceScheduler;

  /** Builds the view of the task. */
  private readonly views: TaskViewBuilder;

  /** Filters successor keys against the requester's current access. */
  private readonly successor: VisibleNextOccurrence;
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
    this.assignees = new AssigneeChecker(members);
    this.locator = new TaskLocator(spaces);
    this.planner = new TaskMovePlanner(spaces);
    this.rules = new TaskRuleGuard();
    this.writer = new TaskChangeWriter();
    this.recurrence = new TaskOccurrenceScheduler(spaces);
    this.views = new TaskViewBuilder();
    this.successor = new VisibleNextOccurrence(spaces);
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
    return this.unitOfWork.run(async (store: TasksStore): Promise<UpdateTaskOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      let candidates: readonly AssigneeCandidate[] = [];
      if (input.patch.status === 'done') {
        const preview: LocatedTask = await this.locator.locate(store, {
          organizationId: input.organizationId,
          viewer,
          taskKey: input.taskKey,
          edit: true,
          lock: false,
          archived: 'refuse',
          expectedVersions: null,
        });
        candidates = await this.assignees.candidates(
          input.organizationId,
          preview.task.snapshot.assigneeIds,
          true,
        );
      }
      const located: LocatedTask = await this.locator.locate(store, {
        organizationId: input.organizationId,
        viewer,
        taskKey: input.taskKey,
        edit: true,
        lock: true,
        archived: 'refuse',
        expectedVersions: input.expectedVersions,
      });
      const { task } = located;
      const plan: PlannedChange = await this.planner.plan(store, viewer, located, input.patch);
      const now: Date = await store.clock.now();
      const preview = this.rules.apply(() => task.update(plan.patch, plan.statuses, now));
      if (
        preview.nextOccurrence !== undefined &&
        task.snapshot.assigneeIds.some(
          (id: string): boolean => !candidates.some((candidate) => candidate.userId === id),
        )
      ) {
        throw new Error('The assignees changed while their memberships were being held.');
      }
      const scheduled: ScheduledTaskUpdate = await this.recurrence.prepare(
        task,
        plan.patch,
        plan.statuses,
        now,
      );
      const update: TaskUpdate = scheduled.update;
      if (update.milestoneReached === true) {
        throw new Error('Milestone completion requires the P3b-2 watcher audience preflight.');
      }
      if (update.changed.length > 0) {
        await this.writer.commit(store, task, update, input.actorUserId, now);
        if (update.changed.includes('listId') || update.changed.includes('spaceId')) {
          await this.moveDescendants(store, plan.descendants, update.task, input, now);
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
    });
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
