import { ActivityEntry } from '../../../../../domain/aggregates/activity/activity-entry.aggregate.js';
import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskDraft } from '../../../../../domain/value-objects/task/task-draft.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { KeyAllocation } from '../../../../models/placement/key-allocation.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ActivityRecorder } from '../../../../services/activity/activity-recorder.service.js';
import { AssigneeChecker } from '../../../../services/member/assignee-checker.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskAnnouncer } from '../../../../services/task/task-announcer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { CreateSubtaskInput } from './create-subtask.input.js';
import type { CreateSubtaskOutput } from './create-subtask.output.js';

/**
 * Class CreateSubtask
 *
 * @description
 * Creates a subtask under a task the actor sees (`POST /internal/v1/tasks/{taskKey}/subtasks`).
 * The subtask takes the list of its parent, on which the actor needs `edit`
 * (`role-insufficient`, after `task-not-found`). Locks follow the order of the module: the membership
 * of the actor, those of the assignees (explicit, or the first assignee of the parent, whose
 * account is read before the parent is locked), then the parent `FOR NO KEY UPDATE`, then the
 * key counter. A membership is never locked while the parent is: a removal locks the membership
 * and then the tasks, so the opposite order could deadlock with it. The domain decides the depth,
 * the limit of 25 and every other rule (`Task.create`). A parent whose first assignee is no
 * longer a member other than a guest gives a subtask without assignee, with no refusal. The
 * parent itself is not changed and emits nothing.
 *
 * Accepted race: the first assignee of the parent is read before the parent is locked. If the
 * parent was reassigned in between, the subtask inherits the account that was read when that
 * account is still one of the parent's assignees after the lock (its membership is already
 * locked), and is created without assignee otherwise, even though the parent now has another
 * first assignee. The next subtask inherits the current one.
 */
export class CreateSubtask {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Reads and locks the memberships of the assignees. */
  private readonly assignees: AssigneeChecker;

  /** Finds the parent. */
  private readonly locator: TaskLocator;

  /** Maps the refusals of the domain. */
  private readonly rules: TaskRuleGuard;

  /** Writes the activity entries. */
  private readonly recorder: ActivityRecorder;

  /** Appends the events. */
  private readonly announcer: TaskAnnouncer;

  /** Builds the view of the subtask. */
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
    this.locator = new TaskLocator(spaces);
    this.rules = new TaskRuleGuard();
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
   * Creates the subtask.
   *
   * @param {CreateSubtaskInput} input - The actor, the parent and the subtask.
   * @returns {Promise<CreateSubtaskOutput>} The subtask created.
   * @throws {TaskRefusal} `organization-not-found`, `task-not-found`, `role-insufficient`,
   * `subtask-depth-exceeded`, `subtask-limit-reached`, `status-hidden`, `cancel-reason-required`,
   * `cancel-reason-unexpected`, `start-date-invalid` or `assignee-invalid`.
   */
  public async execute(input: CreateSubtaskInput): Promise<CreateSubtaskOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<CreateSubtaskOutput> => {
      const { organizationId } = input;
      const viewer: Viewer = await this.viewers.resolve(organizationId, input.actorUserId, true);
      // A subtask is created in the list of its parent: the actor needs `edit` on it.
      const request = {
        organizationId,
        viewer,
        taskKey: input.taskKey,
        edit: true,
        expectedVersions: null,
      };
      let inherited: readonly AssigneeCandidate[] = [];
      let requested: readonly AssigneeCandidate[] = [];
      let peeked: string | undefined;
      if (input.assigneeIds === null) {
        const peek: LocatedTask = await this.locator.locate(store, { ...request, lock: false });
        peeked = peek.task.snapshot.assigneeIds[0];
        inherited = await this.assignees.candidates(
          organizationId,
          peeked === undefined ? [] : [peeked],
          true,
        );
      } else {
        requested = await this.assignees.candidates(organizationId, input.assigneeIds, true);
      }
      const { task: parent, placement }: LocatedTask = await this.locator.locate(store, {
        ...request,
        lock: true,
      });
      // No membership is locked from here: the parent is. A parent reassigned between the read and
      // the lock keeps the account read when it is still assigned, and gets none otherwise.
      const stillAssigned: boolean =
        peeked !== undefined && parent.snapshot.assigneeIds.includes(peeked);
      const assignees: readonly AssigneeCandidate[] =
        input.assigneeIds === null
          ? inherited.filter(
              (candidate: AssigneeCandidate): boolean =>
                stillAssigned && candidate.role !== null && candidate.role !== 'guest',
            )
          : requested;
      const now: Date = await store.clock.now();
      const creator: TaskActor = { type: 'user', id: input.actorUserId };
      const level: number = await store.tasks.levelOf(organizationId, parent.snapshot.id);
      const childCount: number = await store.tasks.childCount(organizationId, parent.snapshot.id);
      const draft: TaskDraft = this.rules.apply((): TaskDraft =>
        Task.create(
          {
            organizationId,
            placement: { listId: parent.snapshot.listId, spaceId: parent.snapshot.spaceId },
            parent: parent.asParent(level, childCount),
            name: input.name,
            description: input.description,
            status: input.status,
            cancelReason: input.cancelReason,
            cancelNote: input.cancelNote,
            priority: input.priority,
            assignees,
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
      const keys: KeyAllocation = await this.spaces.allocateKeys(
        organizationId,
        placement.space.id,
        1,
      );
      const subtask: Task = await store.tasks.insert(
        draft,
        TaskKey.of(keys.prefix, keys.firstNumber),
      );
      await this.recorder.record(store.activity, [
        ActivityEntry.forCreation(subtask.snapshot, creator, now),
      ]);
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      await this.announcer.created(store.events, subtask, actor);
      return this.views.build(store.reader, subtask);
    });
  }
  // #endregion
}
