import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { depthsUnder } from '../../../domain/policies/subtask/subtask-tree.policy.js';
import type { TaskState } from '../../../domain/value-objects/task/task-state.value-object.js';
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
 * when the status changed, then one `task.assigned.v1` per person added, never one for a removal;
 * at an archive or a restoration one `task.archived.v1` or `task.unarchived.v1` per task of the
 * subtree, the root first, then by depth and id, each with the key of the root.
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

  /**
   * Method archived
   *
   * @description
   * Announces an archive: one `task.archived.v1` per task it took, in the order of `treeOrder`.
   *
   * @param {TaskEvents} events - The outbox of the transaction.
   * @param {Task} root - The root of the archive, archived.
   * @param {readonly Task[]} members - Every task of the archive, the root included, archived.
   * @param {EventActor} actor - Who archived them.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {InvalidTaskError} When the members are not a tree under the root.
   */
  public async archived(
    events: TaskEvents,
    root: Task,
    members: readonly Task[],
    actor: EventActor,
  ): Promise<void> {
    for (const member of this.treeOrder(root, members)) {
      await events.taskArchived(member, root.snapshot.key, actor);
    }
  }

  /**
   * Method unarchived
   *
   * @description
   * Announces a restoration: one `task.unarchived.v1` per task it brought back, in the order of
   * `treeOrder`. The `list.unarchived.v1` of a list restored with them is appended before, by the
   * spaces module.
   *
   * @param {TaskEvents} events - The outbox of the transaction.
   * @param {Task} root - The root of the archive, restored.
   * @param {readonly Task[]} members - Every task of the archive, the root included, restored.
   * @param {EventActor} actor - Who restored them.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {InvalidTaskError} When the members are not a tree under the root.
   */
  public async unarchived(
    events: TaskEvents,
    root: Task,
    members: readonly Task[],
    actor: EventActor,
  ): Promise<void> {
    for (const member of this.treeOrder(root, members)) {
      await events.taskUnarchived(member, root.snapshot.key, actor);
    }
  }

  /**
   * Method treeOrder
   *
   * @description
   * The order of the events of a subtree ("Each task of a subtree emits its own event, the root
   * first", `asyncapi/task-service.yaml`): the root, then the members by depth under it
   * (`depthsUnder`, which ignores the parent of the root, so a detached root changes nothing),
   * then by id.
   *
   * @param {Task} root - The root.
   * @param {readonly Task[]} members - The tasks of the subtree, the root included.
   * @returns {readonly Task[]} The tasks, in the order of their events.
   * @throws {InvalidTaskError} When the members are not a tree under the root.
   */
  private treeOrder(root: Task, members: readonly Task[]): readonly Task[] {
    const depths: ReadonlyMap<string, number> = depthsUnder(
      root.snapshot.id,
      members.map((member: Task): TaskState => member.snapshot),
    );
    return [...members].sort(
      (left: Task, right: Task): number =>
        (depths.get(left.snapshot.id) ?? 0) - (depths.get(right.snapshot.id) ?? 0) ||
        (left.snapshot.id < right.snapshot.id ? -1 : left.snapshot.id > right.snapshot.id ? 1 : 0),
    );
  }
  // #endregion
}
