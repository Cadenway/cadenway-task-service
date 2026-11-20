import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import type { TaskField } from '../../../../../domain/value-objects/task/task-field.value-object.js';
import type { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';

/**
 * Interface TaskEvents
 *
 * @description
 * The events of the tasks (`asyncapi/task-service.yaml`), appended to the outbox in the transaction
 * of the change: they leave once it commits, or never. Each carries the whole task after the change
 * but its description, its cancel note and its checklist (the cancel note travels in
 * `task.status-changed.v1` only).
 */
export interface TaskEvents {
  // #region Methods
  /**
   * Method taskCreated
   *
   * @description
   * Appends `task.created.v1`, the task at its version 1.
   *
   * @param {Task} task - The stored task.
   * @param {EventActor} actor - Its creator.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskCreated(task: Task, actor: EventActor): Promise<void>;

  /**
   * Method taskUpdated
   *
   * @description
   * Appends `task.updated.v1`, the task after the change and what changed.
   *
   * @param {Task} task - The task after the change, at its version 2 or more.
   * @param {readonly TaskField[]} changed - The fields that changed, at least one.
   * @param {EventActor} actor - Who changed it.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskUpdated(task: Task, changed: readonly TaskField[], actor: EventActor): Promise<void>;

  /**
   * Method taskStatusChanged
   *
   * @description
   * Appends `task.status-changed.v1`, beside `task.updated.v1` and with the same version.
   *
   * @param {Task} task - The task after the change.
   * @param {StatusKey} previousStatus - Its status before the change.
   * @param {EventActor} actor - Who changed it.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskStatusChanged(task: Task, previousStatus: StatusKey, actor: EventActor): Promise<void>;

  /**
   * Method taskAssigned
   *
   * @description
   * Appends `task.assigned.v1` for one person added: at creation (version 1) or by an assignment.
   *
   * @param {Task} task - The task after the change, with all its assignees.
   * @param {string} assigneeId - The account added.
   * @param {EventActor} actor - Who assigned it.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskAssigned(task: Task, assigneeId: string, actor: EventActor): Promise<void>;

  /**
   * Method taskArchived
   *
   * @description
   * Appends `task.archived.v1` for one task an archive took, the task after the archive.
   *
   * @param {Task} task - The task, archived, at its version 2 or more.
   * @param {TaskKey} rootKey - The key of the root of the archive, the task's own for the root.
   * @param {EventActor} actor - Who archived it.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskArchived(task: Task, rootKey: TaskKey, actor: EventActor): Promise<void>;

  /**
   * Method taskUnarchived
   *
   * @description
   * Appends `task.unarchived.v1` for one task a restoration brought back, the task after it (its
   * parent `null` for a root detached).
   *
   * @param {Task} task - The task, live, at its version 3 or more.
   * @param {TaskKey} rootKey - The key of the root of the archive, the task's own for the root.
   * @param {EventActor} actor - Who restored it.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskUnarchived(task: Task, rootKey: TaskKey, actor: EventActor): Promise<void>;

  /**
   * Method taskTrashed
   *
   * @description
   * Appends `task.trashed.v1` for one task of a trash entry, the task as it was, at the version of
   * its move to the trash, with its entry, the key of the root and the purge instant.
   *
   * @param {Task} task - The task, in the trash, at its version 2 or more.
   * @param {string} entryId - The entry.
   * @param {TaskKey} rootKey - The key of the root of the entry, the task's own for the root.
   * @param {Date} purgeAt - When the entry is erased for good unless restored.
   * @param {EventActor} actor - Who deleted it, or its list or space.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskTrashed(
    task: Task,
    entryId: string,
    rootKey: TaskKey,
    purgeAt: Date,
    actor: EventActor,
  ): Promise<void>;

  /**
   * Method taskRestored
   *
   * @description
   * Appends `task.restored.v1` for one task a restoration from the trash brought back, the task
   * after it (its parent `null` for a root detached), with its entry, which no longer exists.
   *
   * @param {Task} task - The task, live, at its version 3 or more.
   * @param {string} entryId - The entry it came from.
   * @param {TaskKey} rootKey - The key of the root of the entry, the task's own for the root.
   * @param {EventActor} actor - Who restored it.
   * @param {Task} postRestore - Final state after rearchiving, when applicable.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskRestored(
    task: Task,
    entryId: string,
    rootKey: TaskKey,
    actor: EventActor,
    postRestore?: Task,
  ): Promise<void>;

  /**
   * Method taskPurged
   *
   * @description
   * Appends `task.purged.v1` for one task erased for good, at the version of its erasure, with its
   * entry, its list, its space and its parent as stored.
   *
   * @param {Task} task - The task at the version of its erasure (`Task.purge`).
   * @param {string} entryId - The entry.
   * @param {TaskKey} rootKey - The key of the root of the entry, the task's own for the root.
   * @param {EventActor} actor - Who erased it: the person, the requester of "Vider la corbeille",
   * or task-service for the daily purge.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskPurged(task: Task, entryId: string, rootKey: TaskKey, actor: EventActor): Promise<void>;
  // #endregion
}
