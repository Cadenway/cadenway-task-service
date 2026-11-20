import { ActivityEntry } from '../../../../../domain/aggregates/activity/activity-entry.aggregate.js';
import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { isAssignable } from '../../../../../domain/policies/task/assignability.policy.js';
import { TASK_SERVICE_ACTOR } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { IntakeTaskPlacement } from '../../../../ports/outbound/spaces/intake/intake-task-placement.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ActivityRecorder } from '../../../../services/activity/activity-recorder.service.js';
import { AssigneeChecker } from '../../../../services/member/assignee-checker.service.js';
import { TaskAnnouncer } from '../../../../services/task/task-announcer.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import type { CreateIntakeTaskInput } from './create-intake-task.input.js';
import type { CreateIntakeTaskOutput } from './create-intake-task.output.js';

/** Creates a normal task for a verified intake submission in its caller's transaction.
 * The caller holds the publication and checks the assignee's list eligibility through commit. */
export class CreateIntakeTask {
  // #region Properties
  /** Checks the configured assignee's membership. */
  private readonly assignees: AssigneeChecker;
  private readonly rules = new TaskRuleGuard();
  private readonly recorder = new ActivityRecorder();
  private readonly announcer = new TaskAnnouncer();
  // #endregion

  // #region Constructor
  /** Binds the transaction and the directories it joins. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly placement: IntakeTaskPlacement,
    private readonly spaces: Pick<SpaceDirectory, 'allocateKeys'>,
  ) {
    this.assignees = new AssigneeChecker(members);
  }
  // #endregion

  // #region Methods
  /** Uses the normal task assignment rule for a configured intake default. */
  public static allowsAssigneeRole(role: 'owner' | 'admin' | 'member' | 'guest' | null): boolean {
    return isAssignable(role);
  }

  /** Reports that a submitted task cannot use the publication's destination or defaults. */
  public static refusalOf(error: unknown): 'unavailable' | undefined {
    if (!(error instanceof TaskRefusal)) return undefined;
    switch (error.refusal.reason) {
      case 'list-not-found':
      case 'status-hidden':
      case 'cancel-reason-required':
      case 'assignee-invalid':
        return 'unavailable';
      default:
        return undefined;
    }
  }

  /** Creates one task and appends its facts in the caller's tenant transaction. */
  public async execute(input: CreateIntakeTaskInput): Promise<CreateIntakeTaskOutput> {
    return this.work.run(async (store): Promise<CreateIntakeTaskOutput> => {
      const candidates = await this.assignees.candidates(
        input.organizationId,
        input.assigneeId === null ? [] : [input.assigneeId],
        true,
      );
      const destination = await this.placement.lock(input.organizationId, input.listId);
      if (destination === null) throw new TaskRefusal({ reason: 'list-not-found' });

      const now = await store.clock.now();
      const draft = this.rules.apply(() =>
        Task.create(
          {
            organizationId: input.organizationId,
            placement: { listId: input.listId, spaceId: destination.spaceId },
            parent: null,
            name: input.name,
            description: input.description,
            status: input.status,
            cancelReason: null,
            cancelNote: null,
            priority: input.priority,
            assignees: candidates,
            dueDate: input.dueDate,
            estimateMinutes: null,
            labels: [],
            createdBy: TASK_SERVICE_ACTOR,
          },
          destination.statuses,
          now,
        ),
      );
      const keys = await this.spaces.allocateKeys(input.organizationId, destination.spaceId, 1);
      const task = await store.tasks.insert(draft, TaskKey.of(keys.prefix, keys.firstNumber));
      await this.recorder.record(store.activity, [
        ActivityEntry.forCreation(task.snapshot, TASK_SERVICE_ACTOR, now),
      ]);
      await this.announcer.created(store.events, task, TASK_SERVICE_ACTOR);
      return { taskId: task.snapshot.id, taskKey: task.snapshot.key.format() };
    });
  }
  // #endregion
}
