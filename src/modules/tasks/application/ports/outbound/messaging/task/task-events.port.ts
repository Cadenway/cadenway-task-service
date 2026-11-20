import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { DescriptionMentionChanges } from '../../../../../domain/value-objects/mention/description-mention-changes.value-object.js';
import type { Recurrence } from '../../../../../domain/value-objects/task/recurrence.value-object.js';
import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import type { TaskField } from '../../../../../domain/value-objects/task/task-field.value-object.js';
import type { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { WatcherOverride } from '../../../../../domain/value-objects/watcher/watcher-override.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';

/**
 * Interface TaskEvents
 *
 * @description
 * The task facts of `asyncapi/task-service.yaml`, appended to the outbox in the transaction of the
 * change and published after commit. They omit the task description and checklist. The cancel
 * note travels only in `task.status-changed.v1`.
 */
export interface TaskEvents {
  // #region Methods
  /** Appends recipient ID changes for the task description in the write transaction. */
  descriptionMentionsChanged(
    task: Task,
    change: DescriptionMentionChanges,
    actor: EventActor,
  ): Promise<void>;

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
   * Appends the fact of adding or removing a directed dependency at both committed versions.
   *
   * @param action - Whether the stored edge was added or removed.
   * @param dependencyId - Id of the affected edge.
   * @param blocker - The origin task at its resulting version.
   * @param blocked - The destination task at its resulting version.
   * @param actor - The verified editor who changed the graph.
   * @returns Resolves after the outbox insertion.
   */
  dependencyChanged(
    action: 'added' | 'removed',
    dependencyId: string,
    blocker: Task,
    blocked: Task,
    actor: EventActor,
  ): Promise<void>;

  /**
   * Method taskStatusChanged
   *
   * @description
   * Appends `task.status-changed.v1`, beside `task.updated.v1` and with the same version.
   *
   * @param {Task} task - The task after the change.
   * @param {StatusKey} previousStatus - Its status before the change.
   * @param {EventActor} actor - Who changed it.
   * @param {readonly string[]} watcherIds - Eligible effective watchers of the resulting task.
   * @returns {Promise<void>} Resolves once appended.
   */
  taskStatusChanged(
    task: Task,
    previousStatus: StatusKey,
    actor: EventActor,
    watcherIds: readonly string[],
  ): Promise<void>;

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

  /**
   * Appends `milestone.reached.v1` for a genuine transition into done.
   *
   * @param task - The committed milestone state.
   * @param watcherIds - Effective eligible watchers under the task and membership locks.
   * @param actor - The actor who completed the task.
   * @returns Resolves after the event enters the transaction's outbox.
   */
  milestoneReached(task: Task, watcherIds: readonly string[], actor: EventActor): Promise<void>;

  /**
   * Appends `task.occurrence-created.v1` for a successor created in this transaction.
   *
   * @param predecessor - The completed source, at its resulting version.
   * @param successor - The newly stored task at version one.
   * @param cadence - The cadence transferred from the source.
   * @param actor - The actor who completed the source.
   * @returns Resolves after the event enters the transaction's outbox.
   */
  taskOccurrenceCreated(
    predecessor: Task,
    successor: Task,
    cadence: Exclude<Recurrence, 'none'>,
    actor: EventActor,
  ): Promise<void>;

  /** Appends the committed change to an eligible account's explicit watcher override. */
  taskWatcherChanged(task: Task, override: WatcherOverride, actor: EventActor): Promise<void>;
  // #endregion
}
