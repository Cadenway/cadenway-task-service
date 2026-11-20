import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type { TaskCreatedV1 } from '@cadenway/contracts/events/task-service';
import type { TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { EventActor } from '../../../../application/models/actor/event-actor.model.js';
import type { TaskEvents } from '../../../../application/ports/outbound/messaging/task/task-events.port.js';
import type { Task } from '../../../../domain/aggregates/task/task.aggregate.js';
import type { DescriptionMentionChanges } from '../../../../domain/value-objects/mention/description-mention-changes.value-object.js';
import type { Recurrence } from '../../../../domain/value-objects/task/recurrence.value-object.js';
import type { StatusKey } from '../../../../domain/value-objects/task/status-key.value-object.js';
import type { TaskField } from '../../../../domain/value-objects/task/task-field.value-object.js';
import type { TaskKey } from '../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../domain/value-objects/task/task-state.value-object.js';
import type { WatcherOverride } from '../../../../domain/value-objects/watcher/watcher-override.value-object.js';

/**
 * Type TaskPayload
 *
 * @description
 * The common task snapshot members. PostgreSQL assigns the event id and instant. Scheduling
 * fields are reported only in the created and updated snapshots.
 */
type TaskPayload = Omit<TaskCreatedV1, 'id' | 'occurredAt' | 'milestone' | 'recurrence'>;

/**
 * Class OutboxTaskEvents
 *
 * @description
 * `TaskEvents` on the outbox of `@cadenway/nest-messaging`, in the tenant transaction of its unit
 * of work: each payload is the task after the change, validated with the schemas of
 * `@cadenway/contracts/events/task-service` before its row is written, and PostgreSQL assigns the
 * event id and instant. The task is named by its key, never by its id; its description, its
 * checklist and, outside `task.status-changed.v1`, its cancel note never travel. `organizationId`
 * is the organization of the task, the one of the tenant transaction: row-level security refuses a
 * row of another. The relay publishes the rows once the transaction commits, so a rolled-back change
 * emits nothing.
 */
export class OutboxTaskEvents implements TaskEvents {
  // #region Properties
  /**
   * Property transaction
   *
   * @description
   * The tenant transaction the events are appended in.
   *
   * @type {TransactionScope}
   * @readonly
   */
  private readonly transaction: TransactionScope;

  /**
   * Property outbox
   *
   * @description
   * The outbox writer of the kit.
   *
   * @type {OutboxWriter}
   * @readonly
   */
  private readonly outbox: OutboxWriter;

  /**
   * Property onAppend
   *
   * @description
   * Called after each append, so the unit of work wakes the relay once it commits.
   *
   * @type {() => void}
   * @readonly
   */
  private readonly onAppend: () => void;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the events to a transaction.
   *
   * @param {TransactionScope} transaction - The tenant transaction the events are appended in.
   * @param {OutboxWriter} outbox - The outbox writer of the kit.
   * @param {() => void} onAppend - Called after each append.
   * @constructor
   */
  public constructor(transaction: TransactionScope, outbox: OutboxWriter, onAppend: () => void) {
    this.transaction = transaction;
    this.outbox = outbox;
    this.onAppend = onAppend;
  }
  // #endregion

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
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async taskCreated(task: Task, actor: EventActor): Promise<void> {
    await this.outbox.append(
      this.transaction,
      eventSchemas,
      'task.created.v1',
      this.scheduledPayloadOf(task.snapshot, actor),
    );
    this.onAppend();
  }

  /**
   * Method taskUpdated
   *
   * @description
   * Appends `task.updated.v1`, the task after the change and the names of what changed, in the
   * order the caller gives them.
   *
   * @param {Task} task - The task after the change, at its version 2 or more.
   * @param {readonly TaskField[]} changed - The fields that changed, at least one.
   * @param {EventActor} actor - Who changed it: a member, or task-service when a removed member
   * leaves the assignees.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract, as an empty
   * `changed` or a version below 2: a defect, which rolls the transaction back.
   */
  public async taskUpdated(
    task: Task,
    changed: readonly TaskField[],
    actor: EventActor,
  ): Promise<void> {
    await this.outbox.append(this.transaction, eventSchemas, 'task.updated.v1', {
      ...this.scheduledPayloadOf(task.snapshot, actor),
      changed: [...changed],
    });
    this.onAppend();
  }

  /**
   * Appends an edge fact with the blocker as its versioned aggregate.
   *
   * @param action - Whether the edge was added or removed.
   * @param dependencyId - Database id of the affected dependency.
   * @param blocker - The committed state of the origin task.
   * @param blocked - The committed state of the destination task.
   * @param actor - Trusted actor recorded with the fact.
   */
  public async dependencyChanged(
    action: 'added' | 'removed',
    dependencyId: string,
    blocker: Task,
    blocked: Task,
    actor: EventActor,
  ): Promise<void> {
    const origin: TaskState = blocker.snapshot;
    const destination: TaskState = blocked.snapshot;
    const event = action === 'added' ? 'task.dependency-added.v1' : 'task.dependency-removed.v1';
    await this.outbox.append(this.transaction, eventSchemas, event, {
      organizationId: origin.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: origin.version,
      dependencyId,
      blockerKey: origin.key.format(),
      blockerSpaceId: origin.spaceId,
      blockerListId: origin.listId,
      blockerVersion: origin.version,
      blockedKey: destination.key.format(),
      blockedSpaceId: destination.spaceId,
      blockedListId: destination.listId,
      blockedVersion: destination.version,
    });
    this.onAppend();
  }

  /**
   * Method taskStatusChanged
   *
   * @description
   * Appends `task.status-changed.v1`, the task after the change with its previous status and its
   * cancel note, the only event the note travels in.
   *
   * @param {Task} task - The task after the change.
   * @param {StatusKey} previousStatus - Its status before the change.
   * @param {EventActor} actor - Who changed it.
   * @param {readonly string[]} watcherIds - The eligible audience under the task and placement locks.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async taskStatusChanged(
    task: Task,
    previousStatus: StatusKey,
    actor: EventActor,
    watcherIds: readonly string[],
  ): Promise<void> {
    const state: TaskState = task.snapshot;
    await this.outbox.append(this.transaction, eventSchemas, 'task.status-changed.v1', {
      ...this.payloadOf(state, actor),
      previousStatus,
      cancelNote: state.cancelNote,
      watcherIds: [...watcherIds],
    });
    this.onAppend();
  }

  /**
   * Method taskAssigned
   *
   * @description
   * Appends `task.assigned.v1` for one person added, with every assignee after the change.
   *
   * @param {Task} task - The task after the change, with all its assignees.
   * @param {string} assigneeId - The account added.
   * @param {EventActor} actor - Who assigned it.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract, as a task without
   * assignees: a defect, which rolls the transaction back.
   */
  public async taskAssigned(task: Task, assigneeId: string, actor: EventActor): Promise<void> {
    await this.outbox.append(this.transaction, eventSchemas, 'task.assigned.v1', {
      ...this.payloadOf(task.snapshot, actor),
      assigneeId,
    });
    this.onAppend();
  }

  /**
   * Method taskArchived
   *
   * @description
   * Appends `task.archived.v1` for one task an archive took: the task after the archive, as
   * `task.updated.v1` carries it without `changed`, with the key of the root
   * (`asyncapi/task-service.yaml`). Its `occurredAt`, the instant PostgreSQL gives the row, is the
   * transaction instant, the `archivedAt` of the task.
   *
   * @param {Task} task - The task, archived, at its version 2 or more.
   * @param {TaskKey} rootKey - The key of the root of the archive.
   * @param {EventActor} actor - Who archived it.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async taskArchived(task: Task, rootKey: TaskKey, actor: EventActor): Promise<void> {
    await this.outbox.append(this.transaction, eventSchemas, 'task.archived.v1', {
      ...this.payloadOf(task.snapshot, actor),
      rootKey: rootKey.format(),
    });
    this.onAppend();
  }

  /**
   * Method taskUnarchived
   *
   * @description
   * Appends `task.unarchived.v1` for one task a restoration brought back: the task after it, its
   * `parentKey` `null` for a root detached, with the key of the root.
   *
   * @param {Task} task - The task, live, at its version 3 or more.
   * @param {TaskKey} rootKey - The key of the root of the archive.
   * @param {EventActor} actor - Who restored it.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async taskUnarchived(task: Task, rootKey: TaskKey, actor: EventActor): Promise<void> {
    await this.outbox.append(this.transaction, eventSchemas, 'task.unarchived.v1', {
      ...this.payloadOf(task.snapshot, actor),
      rootKey: rootKey.format(),
    });
    this.onAppend();
  }

  /**
   * Method taskTrashed
   *
   * @description
   * Appends `task.trashed.v1` for one task of a trash entry: the task as it was, as
   * `task.updated.v1` carries it without `changed` (its stored parent, as `task.archived.v1`), at
   * the version of its move, with the entry, the key of the root and the purge instant
   * (`asyncapi/task-service.yaml`). Its `occurredAt`, the instant PostgreSQL gives the row, is the
   * transaction instant, the `trashedAt` of the entry.
   *
   * @param {Task} task - The task, in the trash, at its version 2 or more.
   * @param {string} entryId - The entry.
   * @param {TaskKey} rootKey - The key of the root of the entry.
   * @param {Date} purgeAt - When the entry is erased for good unless restored.
   * @param {EventActor} actor - Who deleted it.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async taskTrashed(
    task: Task,
    entryId: string,
    rootKey: TaskKey,
    purgeAt: Date,
    actor: EventActor,
  ): Promise<void> {
    await this.outbox.append(this.transaction, eventSchemas, 'task.trashed.v1', {
      ...this.payloadOf(task.snapshot, actor),
      entryId,
      rootKey: rootKey.format(),
      purgeAt: purgeAt.toISOString(),
    });
    this.onAppend();
  }

  /**
   * Method taskRestored
   *
   * @description
   * Appends `task.restored.v1` for one task a restoration from the trash brought back: the task
   * after it, its `parentKey` `null` for a root detached, with the entry it came from and the key
   * of the root.
   *
   * @param {Task} task - The task, live, at its version 3 or more.
   * @param {string} entryId - The entry, which no longer exists.
   * @param {TaskKey} rootKey - The key of the root of the entry.
   * @param {EventActor} actor - Who restored it.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async taskRestored(
    task: Task,
    entryId: string,
    rootKey: TaskKey,
    actor: EventActor,
    postRestore?: Task,
  ): Promise<void> {
    await this.outbox.append(this.transaction, eventSchemas, 'task.restored.v1', {
      ...this.payloadOf(task.snapshot, actor),
      archivedAt: (postRestore ?? task).snapshot.archive?.at.toISOString() ?? null,
      archivedBy: (postRestore ?? task).snapshot.archive?.by ?? null,
      entryId,
      rootKey: rootKey.format(),
    });
    this.onAppend();
  }

  /**
   * Method taskPurged
   *
   * @description
   * Appends `task.purged.v1` for one task erased for good: its key, its version with the erasure,
   * the entry, the key of the root, its space, its list and its parent as stored, and the actor;
   * nothing else of the task travels, since it is gone.
   *
   * @param {Task} task - The task at the version of its erasure.
   * @param {string} entryId - The entry.
   * @param {TaskKey} rootKey - The key of the root of the entry.
   * @param {EventActor} actor - Who erased it.
   * @returns {Promise<void>} Resolves once appended.
   * @throws {Error} When the payload does not match the schema of the contract: a defect, which
   * rolls the transaction back.
   */
  public async taskPurged(
    task: Task,
    entryId: string,
    rootKey: TaskKey,
    actor: EventActor,
  ): Promise<void> {
    const state: TaskState = task.snapshot;
    await this.outbox.append(this.transaction, eventSchemas, 'task.purged.v1', {
      organizationId: state.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: state.version,
      key: state.key.format(),
      entryId,
      rootKey: rootKey.format(),
      spaceId: state.spaceId,
      listId: state.listId,
      parentKey: state.parentKey === null ? null : state.parentKey.format(),
    });
    this.onAppend();
  }

  /** Records the change in recipients without copying any description or span text. */
  public async descriptionMentionsChanged(
    task: Task,
    change: DescriptionMentionChanges,
    actor: EventActor,
  ): Promise<void> {
    const state = task.snapshot;
    await this.outbox.append(
      this.transaction,
      eventSchemas,
      'task.description-mentions-changed.v1',
      {
        organizationId: state.organizationId,
        actor: { type: actor.type, id: actor.id },
        version: state.version,
        key: state.key.format(),
        spaceId: state.spaceId,
        listId: state.listId,
        addedMentionUserIds: [...change.added],
        removedMentionUserIds: [...change.removed],
      },
    );
    this.onAppend();
  }

  /** Appends the committed effective subscription of the requested account. */
  public async taskWatcherChanged(
    task: Task,
    override: WatcherOverride,
    actor: EventActor,
  ): Promise<void> {
    const { organizationId, version, key, spaceId, listId } = task.snapshot;
    await this.outbox.append(this.transaction, eventSchemas, 'task.watcher-changed.v1', {
      organizationId,
      actor,
      version,
      key: key.format(),
      spaceId,
      listId,
      userId: override.userId,
      requested: override.following ? 'follow' : 'unfollow',
      effectiveFollowing: override.following,
    });
    this.onAppend();
  }

  /**
   * Appends the completed milestone and its eligible watcher audience in the task transaction.
   *
   * @param task - The completed milestone after the write.
   * @param watcherIds - The application snapshot of eligible watchers under the held locks.
   * @param actor - Who completed the milestone.
   * @throws When the milestone has no completion instant or the contract rejects the payload.
   */
  public async milestoneReached(
    task: Task,
    watcherIds: readonly string[],
    actor: EventActor,
  ): Promise<void> {
    const state: TaskState = task.snapshot;
    if (state.completedAt === null) {
      throw new Error('A milestone reached event requires a completion instant.');
    }
    await this.outbox.append(this.transaction, eventSchemas, 'milestone.reached.v1', {
      organizationId: state.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: state.version,
      key: state.key.format(),
      spaceId: state.spaceId,
      listId: state.listId,
      name: state.name,
      dueDate: state.dueDate,
      completedAt: state.completedAt.toISOString(),
      watcherIds: [...watcherIds],
    });
    this.onAppend();
  }

  /**
   * Appends a successor creation fact, versioned by the predecessor after completion.
   *
   * @param predecessor - The completed task whose cadence was cleared when it spawned the successor.
   * @param successor - The new task with the due date of its occurrence.
   * @param cadence - The recurrence cadence transferred from the predecessor.
   * @param actor - Who completed the predecessor.
   * @throws When the successor has no due date or the contract rejects the payload.
   */
  public async taskOccurrenceCreated(
    predecessor: Task,
    successor: Task,
    cadence: Exclude<Recurrence, 'none'>,
    actor: EventActor,
  ): Promise<void> {
    const source: TaskState = predecessor.snapshot;
    const occurrence: TaskState = successor.snapshot;
    if (occurrence.dueDate === null) {
      throw new Error('A task occurrence event requires a successor due date.');
    }
    await this.outbox.append(this.transaction, eventSchemas, 'task.occurrence-created.v1', {
      organizationId: source.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: source.version,
      predecessorKey: source.key.format(),
      predecessorVersion: source.version,
      successorKey: occurrence.key.format(),
      spaceId: source.spaceId,
      listId: source.listId,
      dueDate: occurrence.dueDate,
      cadence,
    });
    this.onAppend();
  }

  /** Adds explicit scheduling values to the created and updated task snapshots. */
  private scheduledPayloadOf(
    state: TaskState,
    actor: EventActor,
  ): Omit<TaskCreatedV1, 'id' | 'occurredAt'> {
    return {
      ...this.payloadOf(state, actor),
      milestone: state.milestone ?? false,
      recurrence: state.recurrence ?? 'none',
    };
  }

  /**
   * Method payloadOf
   *
   * @description
   * The members every `task.*` event carries, built from the task after the change: the keys as
   * `CAD-482`, the dates as stored (`YYYY-MM-DD`), `completedAt` as an ISO 8601 instant, and copies
   * of the assignees and labels in their stored order. The description, the cancel note and the
   * checklist are left out here, so an event only carries the note when it adds it.
   *
   * @param {TaskState} state - The task after the change.
   * @param {EventActor} actor - Who caused the change.
   * @returns {TaskPayload} The common members.
   */
  private payloadOf(state: TaskState, actor: EventActor): TaskPayload {
    return {
      organizationId: state.organizationId,
      actor: { type: actor.type, id: actor.id },
      version: state.version,
      key: state.key.format(),
      spaceId: state.spaceId,
      listId: state.listId,
      parentKey: state.parentKey === null ? null : state.parentKey.format(),
      name: state.name,
      status: state.status,
      cancelReason: state.cancelReason,
      priority: state.priority,
      assigneeIds: [...state.assigneeIds],
      dueDate: state.dueDate,
      startDate: state.startDate,
      estimateMinutes: state.estimateMinutes,
      labels: [...state.labels],
      completedAt: state.completedAt === null ? null : state.completedAt.toISOString(),
    };
  }
  // #endregion
}
