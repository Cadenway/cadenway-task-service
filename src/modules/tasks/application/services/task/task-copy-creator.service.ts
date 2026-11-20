import { ActivityEntry } from '../../../domain/aggregates/activity/activity-entry.aggregate.js';
import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { isAssignable } from '../../../domain/policies/task/assignability.policy.js';
import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import type { TaskDraft } from '../../../domain/value-objects/task/task-draft.value-object.js';
import { MAX_NAME_LENGTH } from '../../../domain/value-objects/task/task-limits.value-object.js';
import type { TaskState } from '../../../domain/value-objects/task/task-state.value-object.js';
import type { TaskCopyInput } from '../../models/task/task-copy-input.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import { ActivityRecorder } from '../activity/activity-recorder.service.js';
import { TaskAnnouncer } from './task-announcer.service.js';
import { TaskRuleGuard } from './task-rule-guard.service.js';

const COPY_SUFFIX = ' (copie)';

/** Creates a copy with ordinary creation activity and facts in the writer's open transaction. */
export class TaskCopyCreator {
  // #region Properties
  /** Applies normal creation invariants. */
  private readonly rules = new TaskRuleGuard();
  private readonly activity = new ActivityRecorder();
  private readonly announcer = new TaskAnnouncer();
  // #endregion

  // #region Methods
  /** Inserts a version-one task and records its activity and outbox facts. */
  public async create(store: TasksStore, input: TaskCopyInput): Promise<Task> {
    const inserted: Task = await store.tasks.insert(this.draft(input), input.key);
    const { actor, now, source } = input;
    const task: Task =
      source.snapshot.checklist.length === 0
        ? inserted
        : await store.copies.insertChecklist(inserted, source.snapshot.checklist);
    await this.recordCreated(store, [task], actor, now);
    return task;
  }

  /** Drafts one copy with the shared copy fields and normal creation rules. */
  public draft(input: Omit<TaskCopyInput, 'key'>): TaskDraft {
    const source: TaskState = input.source.snapshot;
    const { actor, now, placement } = input;
    const assignees: ReadonlyMap<string, AssigneeCandidate> = new Map(
      input.assignees
        .filter((candidate: AssigneeCandidate): boolean => isAssignable(candidate.role))
        .map((candidate: AssigneeCandidate) => [candidate.userId, candidate]),
    );
    const name: string =
      input.keepNameAndStatus === true
        ? source.name
        : Array.from(source.name)
            .slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length)
            .join('') + COPY_SUFFIX;
    const statuses: SpaceStatusUse =
      input.keepNameAndStatus === true
        ? { ...placement.space.statuses, [source.status]: { hidden: false } }
        : placement.space.statuses;
    return this.rules.apply(() =>
      Task.create(
        {
          organizationId: source.organizationId,
          placement: { listId: placement.list.id, spaceId: placement.space.id },
          parent: input.parent,
          name,
          description: source.description,
          status: source.status,
          cancelReason: source.cancelReason,
          cancelNote: source.cancelNote,
          priority: source.priority,
          assignees: source.assigneeIds.flatMap((id: string): readonly AssigneeCandidate[] => {
            const candidate: AssigneeCandidate | undefined = assignees.get(id);
            return candidate === undefined ? [] : [candidate];
          }),
          dueDate: source.dueDate,
          startDate: source.startDate,
          estimateMinutes: source.estimateMinutes,
          milestone: source.milestone ?? false,
          recurrence: 'none',
          labels: source.labels,
          createdBy: actor,
        },
        statuses,
        now,
      ),
    );
  }

  /** Inserts all creation activity together, then appends the ordinary facts in task order. */
  public async recordCreated(
    store: TasksStore,
    tasks: readonly Task[],
    actor: TaskCopyInput['actor'],
    now: Date,
  ): Promise<void> {
    await this.activity.record(
      store.activity,
      tasks.map((task: Task) => ActivityEntry.forCreation(task.snapshot, actor, now)),
    );
    for (const task of tasks) {
      await this.announcer.created(store.events, task, actor);
    }
  }
  // #endregion
}
