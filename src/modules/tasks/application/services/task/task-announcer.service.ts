import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { TaskUpdate } from '../../../domain/value-objects/task/task-update.value-object.js';
import type { EventActor } from '../../models/actor/event-actor.model.js';
import type { TaskEvents } from '../../ports/outbound/messaging/task/task-events.port.js';

/**
 * Class TaskAnnouncer
 *
 * @description
 * Appends the events of a created or a changed task to the outbox, in the order the contract
 * documents (`asyncapi/task-service.yaml`): at a creation `task.created.v1` then one
 * `task.assigned.v1` per assignee; at a change `task.updated.v1`, then `task.status-changed.v1`
 * when the status changed, then one `task.assigned.v1` per person added, never one for a removal.
 */
export class TaskAnnouncer {
  // #region Methods
  /**
   * Method created
   *
   * @description
   * Announces a task just created.
   *
   * @param {TaskEvents} events - The outbox of the transaction.
   * @param {Task} task - The stored task, at its version 1.
   * @param {EventActor} actor - Its creator.
   * @returns {Promise<void>} Resolves once appended.
   */
  public async created(events: TaskEvents, task: Task, actor: EventActor): Promise<void> {
    await events.taskCreated(task, actor);
    for (const assigneeId of task.snapshot.assigneeIds) {
      await events.taskAssigned(task, assigneeId, actor);
    }
  }

  /**
   * Method changed
   *
   * @description
   * Announces a change; appends nothing when the update changed nothing.
   *
   * @param {TaskEvents} events - The outbox of the transaction.
   * @param {Task} before - The task before the change.
   * @param {TaskUpdate} update - The task after the change and what changed.
   * @param {EventActor} actor - Who changed it.
   * @returns {Promise<void>} Resolves once appended.
   */
  public async changed(
    events: TaskEvents,
    before: Task,
    update: TaskUpdate,
    actor: EventActor,
  ): Promise<void> {
    if (update.changed.length === 0) {
      return;
    }
    await events.taskUpdated(update.task, update.changed, actor);
    if (update.changed.includes('status')) {
      await events.taskStatusChanged(update.task, before.snapshot.status, actor);
    }
    for (const assigneeId of update.task.snapshot.assigneeIds) {
      if (!before.snapshot.assigneeIds.includes(assigneeId)) {
        await events.taskAssigned(update.task, assigneeId, actor);
      }
    }
  }
  // #endregion
}
