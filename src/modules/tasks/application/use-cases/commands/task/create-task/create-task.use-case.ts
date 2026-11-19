import { ActivityEntry } from '../../../../../domain/aggregates/activity/activity-entry.aggregate.js';
import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskDraft } from '../../../../../domain/value-objects/task/task-draft.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskPlacement } from '../../../../../domain/value-objects/task/task-placement.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { HeldList } from '../../../../models/placement/held-list.model.js';
import type { KeyAllocation } from '../../../../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ActivityRecorder } from '../../../../services/activity/activity-recorder.service.js';
import { AssigneeChecker } from '../../../../services/member/assignee-checker.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskAnnouncer } from '../../../../services/task/task-announcer.service.js';
import { TaskEditGuard } from '../../../../services/task/task-edit-guard.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { CreateTaskInput } from './create-task.input.js';
import type { CreateTaskOutput } from './create-task.output.js';

/**
 * Class CreateTask
 *
 * @description
 * Creates a task in a list the actor sees, with the subtasks of the request
 * (`POST /internal/v1/lists/{listId}/tasks`). In one tenant transaction, which joins the one of the
 * idempotency interceptor: the membership of the actor is locked, the list is read through the
 * spaces module (`list-not-found` for an unknown list or a list the actor has no role on,
 * `role-insufficient` for a list they see without `edit`), the memberships of the assignees are
 * locked in id order, the domain drafts the task (`Task.create`
 * decides every rule and its refusals), then the list is held `FOR SHARE` (`HoldList`), so that a
 * deletion of the list either committed first, and the creation answers `list-not-found` as for an
 * unseen list, or waits for it and its job moves the new task to the trash too, then the keys are
 * allocated, one for the task and one per
 * subtask in body order, so that the counter of the prefix stays locked for the shortest time:
 * after the key counter only statements remain, one for the task and, whatever the number of
 * subtasks, one multi-row statement for the subtasks, one for their assignees and one for their
 * labels. A subtask names its parent by the id and the key of the stored task, which the database
 * and the allocation give, so the drafts of the subtasks are built once the task is stored, not
 * before the allocation. Each task gets its `create` activity entry and its events (`task.created.v1`, then one
 * `task.assigned.v1` per assignee, the subtasks after the task). A subtask takes the list, the
 * status `todo`, the priority `moyenne` and the first assignee of the task.
 */
export class CreateTask {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Reads and locks the memberships of the assignees. */
  private readonly assignees: AssigneeChecker;

  /** Maps the refusals of the domain. */
  private readonly rules: TaskRuleGuard;

  /** Checks the role a creation needs on the list. */
  private readonly editing: TaskEditGuard;

  /** Writes the activity entries. */
  private readonly recorder: ActivityRecorder;

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
    this.assignees = new AssigneeChecker(members);
    this.rules = new TaskRuleGuard();
    this.editing = new TaskEditGuard();
    this.recorder = new ActivityRecorder();
    this.announcer = new TaskAnnouncer();
    this.views = new TaskViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Creates the task and its subtasks.
   *
   * @param {CreateTaskInput} input - The actor, the list and the task.
   * @returns {Promise<CreateTaskOutput>} The task created.
   * @throws {TaskRefusal} `organization-not-found`, `list-not-found`, `role-insufficient`,
   * `status-hidden`,
   * `cancel-reason-required`, `cancel-reason-unexpected`, `start-date-invalid` or
   * `assignee-invalid`.
   */
  public async execute(input: CreateTaskInput): Promise<CreateTaskOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<CreateTaskOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const placement: ListPlacement | null = await this.spaces.findVisibleList(
        input.organizationId,
        viewer,
        input.listId,
      );
      if (placement === null) {
        throw new TaskRefusal({ reason: 'list-not-found' });
      }
      this.editing.requireEdit(placement.list);
      const candidates: readonly AssigneeCandidate[] = await this.assignees.candidates(
        input.organizationId,
        input.assigneeIds,
        true,
      );
      const now: Date = await store.clock.now();
      const creator: TaskActor = { type: 'user', id: input.actorUserId };
      const where: TaskPlacement = { listId: placement.list.id, spaceId: placement.space.id };
      const draft: TaskDraft = this.rules.apply((): TaskDraft =>
        Task.create(
          {
            organizationId: input.organizationId,
            placement: where,
            parent: null,
            name: input.name,
            description: input.description,
            status: input.status,
            cancelReason: input.cancelReason,
            cancelNote: input.cancelNote,
            priority: input.priority,
            assignees: candidates,
            dueDate: input.dueDate,
            startDate: input.startDate,
            estimateMinutes: input.estimateMinutes,
            labels: input.labels,
            createdBy: creator,
          },
          placement.space.statuses,
          now,
        ),
      );
      const held: HeldList = await this.spaces.holdList(input.organizationId, placement.list.id);
      if (held.outcome !== 'live') {
        throw new TaskRefusal({ reason: 'list-not-found' });
      }
      const keys: KeyAllocation = await this.spaces.allocateKeys(
        input.organizationId,
        placement.space.id,
        1 + input.subtaskNames.length,
      );

      const task: Task = await store.tasks.insert(draft, TaskKey.of(keys.prefix, keys.firstNumber));
      const firstAssignee: readonly AssigneeCandidate[] = candidates.slice(0, 1);
      const subtaskDrafts: readonly TaskDraft[] = input.subtaskNames.map(
        (name: string, index: number): TaskDraft =>
          this.rules.apply((): TaskDraft =>
            Task.create(
              {
                organizationId: input.organizationId,
                placement: where,
                parent: task.asParent(1, index),
                name,
                description: null,
                status: 'todo',
                cancelReason: null,
                cancelNote: null,
                priority: 'moyenne',
                assignees: firstAssignee,
                dueDate: null,
                startDate: null,
                estimateMinutes: null,
                labels: [],
                createdBy: creator,
              },
              placement.space.statuses,
              now,
            ),
          ),
      );
      const subtasks: readonly Task[] =
        subtaskDrafts.length === 0
          ? []
          : await store.tasks.insertMany(
              subtaskDrafts,
              subtaskDrafts.map((_subtask: TaskDraft, index: number): TaskKey =>
                TaskKey.of(keys.prefix, keys.firstNumber + 1 + index),
              ),
            );
      const created: readonly Task[] = [task, ...subtasks];
      await this.recorder.record(
        store.activity,
        created.map((made: Task) => ActivityEntry.forCreation(made.snapshot, creator, now)),
      );
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      for (const made of created) {
        await this.announcer.created(store.events, made, actor);
      }
      return this.views.build(store.reader, task);
    });
  }
  // #endregion
}
