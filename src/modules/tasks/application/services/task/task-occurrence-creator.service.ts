import { ActivityEntry } from '../../../domain/aggregates/activity/activity-entry.aggregate.js';
import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { isAssignable } from '../../../domain/policies/task/assignability.policy.js';
import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { ChecklistItemState } from '../../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { NextOccurrenceSchedule } from '../../../domain/value-objects/task/next-occurrence-schedule.value-object.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskDraft } from '../../../domain/value-objects/task/task-draft.value-object.js';
import type { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../domain/value-objects/task/task-state.value-object.js';
import type { EventActor } from '../../models/actor/event-actor.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import { ActivityRecorder } from '../activity/activity-recorder.service.js';
import { TaskAnnouncer } from './task-announcer.service.js';
import { TaskRuleGuard } from './task-rule-guard.service.js';

/** Creates a recurring successor in the source update's existing tenant transaction. */
export class TaskOccurrenceCreator {
  // #region Properties
  /** Maps domain rule refusals. */
  private readonly rules: TaskRuleGuard = new TaskRuleGuard();

  /** Records creation history. */
  private readonly activity: ActivityRecorder = new ActivityRecorder();

  /** Appends the ordinary creation and assignment facts. */
  private readonly announcer: TaskAnnouncer = new TaskAnnouncer();
  // #endregion

  // #region Methods
  /**
   * Copies the eligible fields and creates a root task with fresh unchecked checklist items.
   * The caller holds the source task, placement and candidate memberships until commit, and has
   * already reserved the key. All repository and outbox writes use the same transaction store.
   *
   * @param store - The transaction-bound repositories and outbox.
   * @param predecessor - The updated, linked source at its resulting version.
   * @param schedule - The successor schedule decided by the domain.
   * @param key - The reserved successor key.
   * @param statuses - The destination space's status configuration.
   * @param candidates - The source's assignees and their roles held through the transaction.
   * @param actor - The actor who completed the source.
   * @param now - The transaction instant.
   * @returns The successor as created at version one.
   */
  public async create(
    store: TasksStore,
    predecessor: Task,
    schedule: NextOccurrenceSchedule,
    key: TaskKey,
    statuses: SpaceStatusUse,
    candidates: readonly AssigneeCandidate[],
    actor: TaskActor,
    now: Date,
  ): Promise<Task> {
    const source: TaskState = predecessor.snapshot;
    const draft: TaskDraft = this.rules.apply(() =>
      Task.create(
        {
          organizationId: source.organizationId,
          placement: { listId: source.listId, spaceId: source.spaceId },
          parent: null,
          name: source.name,
          description: source.description,
          status: 'todo',
          cancelReason: null,
          cancelNote: null,
          priority: source.priority,
          assignees: candidates.filter(
            (candidate) =>
              source.assigneeIds.includes(candidate.userId) && isAssignable(candidate.role),
          ),
          dueDate: schedule.dueDate,
          startDate: schedule.startDate,
          estimateMinutes: source.estimateMinutes,
          milestone: source.milestone ?? false,
          recurrence: schedule.recurrence,
          monthlyAnchorDay: schedule.monthlyAnchorDay,
          labels: source.labels,
          createdBy: actor,
        },
        statuses,
        now,
      ),
    );
    let successor: Task = await store.tasks.insert(draft, key);
    for (const previous of source.checklist) {
      const item: ChecklistItemState = await store.tasks.insertChecklistItem(
        source.organizationId,
        successor.snapshot.id,
        this.rules.apply(() => successor.draftChecklistItem(previous.text)),
      );
      // Initial checklist rows are part of creation and keep the successor's version at one.
      successor = Task.restore({
        ...successor.snapshot,
        checklist: [...successor.snapshot.checklist, item],
      });
    }
    await this.activity.record(store.activity, [
      ActivityEntry.forCreation(successor.snapshot, actor, now),
    ]);
    const eventActor: EventActor = { type: actor.type, id: actor.id };
    await this.announcer.created(store.events, successor, eventActor);
    await store.events.taskOccurrenceCreated(
      predecessor,
      successor,
      schedule.recurrence,
      eventActor,
    );
    return successor;
  }
  // #endregion
}
