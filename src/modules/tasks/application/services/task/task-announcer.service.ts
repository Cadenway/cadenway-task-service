import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { depthsUnder } from '../../../domain/policies/subtask/subtask-tree.policy.js';
import type { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
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
 * subtree, the root first, then by depth and id, each with the key of the root; and the same for
 * the trash: one `task.trashed.v1`, `task.restored.v1` or `task.purged.v1` per task of an entry,
 * each with the entry and the key of its root.
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
   * @param {readonly string[]} watcherIds - The eligible audience for a status change.
   * @returns {Promise<void>} Resolves once appended.
   */
  public async changed(
    events: TaskEvents,
    before: Task,
    update: TaskUpdate,
    actor: EventActor,
    watcherIds: readonly string[] = [],
  ): Promise<void> {
    if (update.changed.length === 0) {
      return;
    }
    await events.taskUpdated(
      update.task,
      update.changed,
      actor,
      update.changed.includes('listId') ? before.snapshot.listId : undefined,
    );
    if (update.changed.includes('status')) {
      await events.taskStatusChanged(update.task, before.snapshot.status, actor, watcherIds);
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
   * Method trashed
   *
   * @description
   * Announces a trash entry: one `task.trashed.v1` per task it took, in the order of `treeOrder`,
   * with the entry and its purge instant.
   *
   * @param {TaskEvents} events - The outbox of the transaction.
   * @param {Task} root - The root of the entry, in the trash.
   * @param {readonly Task[]} members - Every task of the entry, the root included, in the trash.
   * @param {Date} purgeAt - When the entry is erased for good unless restored.
   * @param {EventActor} actor - Who deleted them.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {InvalidTaskError} When the members are not a tree under the root.
   * @throws {Error} When the root is not in the trash, a defect.
   */
  public async trashed(
    events: TaskEvents,
    root: Task,
    members: readonly Task[],
    purgeAt: Date,
    actor: EventActor,
  ): Promise<void> {
    const entryId: string = this.entryOf(root);
    for (const member of this.treeOrder(root, members, true)) {
      await events.taskTrashed(member, entryId, root.snapshot.key, purgeAt, actor);
    }
  }

  /**
   * Method restored
   *
   * @description
   * Announces a restoration from the trash: one `task.restored.v1` per task it brought back, in the
   * order of `treeOrder`, at the version of its restoration; each member that comes back archived
   * is followed at once by its `task.archived.v1` at the next version, archived again as of the
   * restoration (the instant and the actor of the restoration, the key of the root of its archive),
   * so a consumer that follows the contract, which ignores a version it already applied, hides it
   * again; `task.restored.v1` also carries the final archive state. The `space.restored.v1` and
   * `list.restored.v1` of what came back with them are appended before, by the spaces module.
   *
   * @param {TaskEvents} events - The outbox of the transaction.
   * @param {Task} root - The root of the entry, restored.
   * @param {readonly Task[]} members - Every task of the entry, the root included, restored (an
   * archived one at the version of its restoration).
   * @param {string} entryId - The entry they came from, which no longer exists.
   * @param {EventActor} actor - Who restored them, the actor of every event.
   * @param {ReadonlyMap<string, Task>} rearchived - The archived members archived again as of the
   * restoration, at the next version, by id.
   * @param {ReadonlyMap<string, TaskKey>} archiveRootKeys - The key of the root of each archive a
   * member is in, by the id of that root.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {InvalidTaskError} When the members are not a tree under the root.
   * @throws {Error} When the key of the root of an archive is missing, a defect.
   */
  public async restored(
    events: TaskEvents,
    root: Task,
    members: readonly Task[],
    entryId: string,
    actor: EventActor,
    rearchived: ReadonlyMap<string, Task>,
    archiveRootKeys: ReadonlyMap<string, TaskKey>,
  ): Promise<void> {
    for (const member of this.treeOrder(root, members, true)) {
      await events.taskRestored(
        member,
        entryId,
        root.snapshot.key,
        actor,
        rearchived.get(member.snapshot.id),
      );
      const again: Task | undefined = rearchived.get(member.snapshot.id);
      const archive = again?.snapshot.archive ?? null;
      if (again !== undefined && archive !== null) {
        const rootKey: TaskKey | undefined = archiveRootKeys.get(archive.rootId);
        if (rootKey === undefined) {
          throw new Error(
            `The root ${archive.rootId} of the archive of ${again.snapshot.id} has no key.`,
          );
        }
        await events.taskArchived(again, rootKey, actor);
      }
    }
  }

  /**
   * Method purged
   *
   * @description
   * Announces an erasure: one `task.purged.v1` per task of the entry, in the order of `treeOrder`,
   * each at the version of its erasure.
   *
   * @param {TaskEvents} events - The outbox of the transaction.
   * @param {Task} root - The root of the entry, at the version of its erasure.
   * @param {readonly Task[]} members - Every task of the entry, the root included, at the version
   * of their erasure.
   * @param {EventActor} actor - Who erased them.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {InvalidTaskError} When the members are not a tree under the root.
   * @throws {Error} When the root is not in the trash, a defect.
   */
  public async purged(
    events: TaskEvents,
    root: Task,
    members: readonly Task[],
    actor: EventActor,
  ): Promise<void> {
    const entryId: string = this.entryOf(root);
    for (const member of this.treeOrder(root, members, true)) {
      await events.taskPurged(member, entryId, root.snapshot.key, actor);
    }
  }

  /**
   * Method entryOf
   *
   * @description
   * The entry of a task in the trash.
   *
   * @param {Task} root - The task.
   * @returns {string} The id of its entry.
   * @throws {Error} When the task is not in the trash, a defect.
   */
  private entryOf(root: Task): string {
    const { trash, id } = root.snapshot;
    if (trash === null) {
      throw new Error(`The task ${id} is announced from the trash, it is not in it.`);
    }
    return trash.entryId;
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
   * @param {boolean} [entry] - `true` for a trash entry, whose archived subtasks may hang below the
   * 3 levels of a tree (the bound is then the number of its tasks); `false` by default.
   * @returns {readonly Task[]} The tasks, in the order of their events.
   * @throws {InvalidTaskError} When the members are not a tree under the root.
   */
  private treeOrder(root: Task, members: readonly Task[], entry: boolean = false): readonly Task[] {
    const states: readonly TaskState[] = members.map((member: Task): TaskState => member.snapshot);
    const depths: ReadonlyMap<string, number> = entry
      ? depthsUnder(root.snapshot.id, states, states.length)
      : depthsUnder(root.snapshot.id, states);
    return [...members].sort(
      (left: Task, right: Task): number =>
        (depths.get(left.snapshot.id) ?? 0) - (depths.get(right.snapshot.id) ?? 0) ||
        (left.snapshot.id < right.snapshot.id ? -1 : left.snapshot.id > right.snapshot.id ? 1 : 0),
    );
  }
  // #endregion
}
