import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { ActivityEntry } from '../../../domain/aggregates/activity/activity-entry.aggregate.js';
import type { ActivityEntryDraft } from '../../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskUpdate } from '../../../domain/value-objects/task/task-update.value-object.js';
import type { EventActor } from '../../models/actor/event-actor.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import { ActivityRecorder } from '../activity/activity-recorder.service.js';
import { TaskAnnouncer } from './task-announcer.service.js';

/**
 * Class TaskChangeWriter
 *
 * @description
 * Persists a change a user made to a task the use case holds locked, in the transaction of the
 * store: the task, the activity entries the change calls for (`ActivityEntry.forChange`, merged by
 * the coalescing policy) and the events, in that order. An update that changed nothing writes
 * nothing, records nothing and emits nothing.
 */
export class TaskChangeWriter {
  // #region Properties
  /** Writes the activity entries. */
  private readonly recorder: ActivityRecorder;

  /** Appends the events. */
  private readonly announcer: TaskAnnouncer;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Builds the services it composes.
   *
   * @constructor
   */
  public constructor() {
    this.recorder = new ActivityRecorder();
    this.announcer = new TaskAnnouncer();
  }
  // #endregion

  // #region Methods
  /**
   * Method commit
   *
   * @description
   * Writes the update.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} before - The task as it was read under its lock.
   * @param {TaskUpdate} update - The task after the change and what changed.
   * @param {string} actorUserId - The account that made the change.
   * @param {Date} now - The transaction instant.
   * @param {readonly string[]} watcherIds - The eligible audience for a status change.
   * @returns {Promise<void>} Resolves once written.
   */
  public async commit(
    store: TasksStore,
    before: Task,
    update: TaskUpdate,
    actorUserId: string,
    now: Date,
    watcherIds: readonly string[] = [],
  ): Promise<void> {
    await this.commitAs(store, before, update, { type: 'user', id: actorUserId }, now, watcherIds);
  }

  /** Writes a task change attributed to its authenticated actor. */
  public async commitAs(
    store: TasksStore,
    before: Task,
    update: TaskUpdate,
    actor: TaskActor,
    now: Date,
    watcherIds: readonly string[] = [],
  ): Promise<void> {
    if (update.changed.length === 0) {
      return;
    }
    if (
      update.nextOccurrence !== undefined &&
      (update.task.snapshot.nextOccurrenceKey === null ||
        update.task.snapshot.nextOccurrenceKey === undefined)
    ) {
      throw new Error('A planned occurrence needs its allocated successor key before saving.');
    }
    const eventActor: EventActor = { type: actor.type, id: actor.id };
    await store.tasks.save(before, update.task);
    const entries: readonly ActivityEntryDraft[] = ActivityEntry.forChange(
      before.snapshot,
      update.task.snapshot,
      actor,
      now,
    );
    await this.recorder.record(store.activity, entries);
    await this.announcer.changed(store.events, before, update, eventActor, watcherIds);
    if (update.milestoneReached === true) {
      await store.events.milestoneReached(update.task, watcherIds, eventActor);
    }
  }
  // #endregion
}
