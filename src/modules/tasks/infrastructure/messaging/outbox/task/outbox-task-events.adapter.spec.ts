import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type {
  EventName,
  MilestoneReachedV1,
  TaskArchivedV1,
  TaskAssignedV1,
  TaskCreatedV1,
  TaskOccurrenceCreatedV1,
  TaskPurgedV1,
  TaskStatusChangedV1,
  TaskTrashedV1,
  TaskUpdatedV1,
} from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { EventDataOf, EventNameOf, EventSchemas } from '@cadenway/nest-messaging';
import { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { AppendedEvent } from '@cadenway/nest-messaging/outbox';
import { beforeEach, describe, expect, it } from 'vitest';

import type { EventActor } from '../../../../application/models/actor/event-actor.model.js';
import { Task } from '../../../../domain/aggregates/task/task.aggregate.js';
import {
  ATELIER_NORD,
  BUGS,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  MAQUETTES,
  PRODUIT,
  SPRINT_14,
  CAD_482,
  CAD_482_ENTRY,
  archiveFrom,
  subtaskState,
  taskState,
  trashIn,
} from '../../../../domain/tasks.fixture.js';
import type { TaskField } from '../../../../domain/value-objects/task/task-field.value-object.js';
import { TaskKey } from '../../../../domain/value-objects/task/task-key.value-object.js';
import { OutboxTaskEvents } from './outbox-task-events.adapter.js';

/** An append the fake writer received, in the order received. */
interface RecordedAppend {
  // #region Properties
  /** The transaction given. */
  readonly transaction: unknown;

  /** The schema map given. */
  readonly schemas: unknown;

  /** The event name. */
  readonly name: string;

  /** The payload, without the id and the instant the writer adds. */
  readonly data: object;
  // #endregion
}

/** Id PostgreSQL would assign to the event, added before the contract schema parses a payload. */
const EVENT_ID = '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d06';

/** Instant PostgreSQL would assign to the event. */
const OCCURRED_AT = '2026-11-08T10:20:00.000Z';

/** Camille Martin, the member acting through the API gateway. */
const camille: EventActor = { type: 'user', id: CAMILLE };

/** task-service itself, when a removed member leaves the assignees. */
const taskService: EventActor = { type: 'system', id: 'task-service' };

/**
 * An `OutboxWriter` that writes nothing: it records each append, and the order of the appends
 * and the wake-ups in a shared log.
 */
class RecordingOutboxWriter extends OutboxWriter {
  // #region Properties
  /** The appends received. */
  public readonly appends: RecordedAppend[] = [];

  /** The appends and the wake-ups, in order. */
  public readonly log: string[];

  /** The failure every append rejects with, or `null` to succeed. */
  public failure: Error | null = null;
  // #endregion

  // #region Constructor
  /**
   * Records into a log shared with the wake-up callback.
   *
   * @param log - The shared log.
   */
  public constructor(log: string[]) {
    // The routing options are only read by the real append, which this fake replaces.
    super({} as ConstructorParameters<typeof OutboxWriter>[0]);
    this.log = log;
  }
  // #endregion

  // #region Methods
  /**
   * Records the append, or rejects with `failure`.
   *
   * @param tx - The transaction.
   * @param schemas - The schemas of the contract.
   * @param name - The event name.
   * @param data - The payload without its id and instant.
   * @returns The identity PostgreSQL would assign.
   */
  public override append<
    TDatabase extends DatabaseSchema,
    TSchemas extends EventSchemas,
    TName extends EventNameOf<TSchemas>,
  >(
    tx: TransactionScope<TDatabase>,
    schemas: TSchemas,
    name: TName,
    data: EventDataOf<TSchemas, TName>,
  ): Promise<AppendedEvent> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.appends.push({ transaction: tx, schemas, name, data });
    this.log.push(`append ${name}`);
    return Promise.resolve({ id: EVENT_ID, occurredAt: OCCURRED_AT });
  }
  // #endregion
}

/**
 * Parses a recorded payload with the schema of the contract for its event, once the writer added
 * the id and the instant.
 *
 * @param append - The recorded append.
 * @param name - The event it must be.
 * @returns The parsed payload.
 */
function parsed(append: RecordedAppend | undefined, name: EventName): unknown {
  expect(append?.name).toBe(name);
  return eventSchemas[name].parse({ id: EVENT_ID, occurredAt: OCCURRED_AT, ...append?.data });
}

/** The members of CAD-482 (`taskState`) every `task.*` event carries, at version 12. */
const cad482: Omit<TaskCreatedV1, 'id' | 'occurredAt'> = {
  organizationId: ATELIER_NORD,
  actor: { type: 'user', id: CAMILLE },
  version: 12,
  key: 'CAD-482',
  spaceId: PRODUIT,
  listId: SPRINT_14,
  parentKey: null,
  name: 'Refondre l’écran de connexion SSO',
  status: 'progress',
  cancelReason: null,
  priority: 'haute',
  assigneeIds: [CAMILLE, INES],
  dueDate: '2026-11-12',
  startDate: '2026-11-11',
  estimateMinutes: 480,
  labels: ['Auth', 'Front'],
  completedAt: null,
};

/** Ordinary task snapshots report both scheduling defaults explicitly. */
const cad482Scheduled: Omit<TaskCreatedV1, 'id' | 'occurredAt'> = {
  ...cad482,
  milestone: false,
  recurrence: 'none',
};

/** CAD-482 cancelled as a duplicate with a note, with its description and checklist. */
const cancelledWithNote: Task = Task.restore(
  taskState({
    version: 13,
    status: 'cancelled',
    cancelReason: 'duplicate',
    cancelNote: 'Doublon de CAD-470.',
  }),
);

describe('OutboxTaskEvents: the task.* events on the outbox, as the contract defines them', () => {
  let log: string[];
  let outbox: RecordingOutboxWriter;
  let transaction: TransactionScope;
  let events: OutboxTaskEvents;

  beforeEach(() => {
    log = [];
    outbox = new RecordingOutboxWriter(log);
    transaction = { kind: 'tenant', organizationId: ATELIER_NORD } as TransactionScope;
    events = new OutboxTaskEvents(transaction, outbox, (): void => {
      log.push('wake');
    });
  });

  describe('task.created.v1', () => {
    it('appends a top-level task with its dates, estimate and labels in the transaction', async () => {
      await events.taskCreated(Task.restore(taskState({ version: 1 })), camille);

      const append: RecordedAppend | undefined = outbox.appends[0];
      expect(append?.transaction).toBe(transaction);
      expect(append?.schemas).toBe(eventSchemas);
      const expected: TaskCreatedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482Scheduled,
        version: 1,
      };
      expect(parsed(append, 'task.created.v1')).toStrictEqual(expected);
    });

    it('names a subtask by its key and its parent by the parent key, without dates, estimate or labels', async () => {
      await events.taskCreated(Task.restore(subtaskState()), camille);

      const expected: TaskCreatedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482Scheduled,
        version: 1,
        key: 'CAD-483',
        parentKey: 'CAD-482',
        name: 'Ajouter le bouton SSO',
        status: 'todo',
        priority: 'moyenne',
        assigneeIds: [CAMILLE],
        dueDate: null,
        startDate: null,
        estimateMinutes: null,
        labels: [],
      };
      expect(parsed(outbox.appends[0], 'task.created.v1')).toStrictEqual(expected);
    });
  });

  describe('task.updated.v1', () => {
    it.each<readonly [string, Partial<Parameters<typeof taskState>[0]>, readonly TaskField[]]>([
      ['a rename', { name: 'Refondre la connexion SSO' }, ['name']],
      ['a description', { description: 'Nouvelle description.' }, ['description']],
      ['a checklist item', {}, ['checklist']],
      [
        'a due date shift that moves the start',
        { dueDate: '2026-11-14', startDate: '2026-11-13' },
        ['dueDate', 'startDate'],
      ],
      ['a move to Bugs', { listId: BUGS }, ['listId']],
      [
        'a move to Maquettes of Design',
        { listId: MAQUETTES, spaceId: DESIGN },
        ['listId', 'spaceId'],
      ],
      [
        'a subtask leaving its parent for another space',
        {
          key: subtaskState().key,
          parentId: null,
          parentKey: null,
          listId: MAQUETTES,
          spaceId: DESIGN,
        },
        ['listId', 'spaceId', 'parentKey'],
      ],
      [
        'a cancellation',
        { status: 'cancelled', cancelReason: 'wontdo', cancelNote: 'Abandonné.' },
        ['status', 'cancelReason', 'cancelNote'],
      ],
      ['a label added', { labels: ['Auth', 'Front', 'Sécurité'] }, ['labels']],
    ])('carries %s and names what changed', async (_change, overrides, changed) => {
      const task: Task = Task.restore(taskState({ version: 13, ...overrides }));

      await events.taskUpdated(task, changed, camille);

      const state = task.snapshot;
      const expected: TaskUpdatedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482Scheduled,
        version: 13,
        key: state.key.format(),
        listId: state.listId,
        spaceId: state.spaceId,
        parentKey: null,
        name: state.name,
        status: state.status,
        cancelReason: state.cancelReason,
        labels: [...state.labels],
        dueDate: state.dueDate,
        startDate: state.startDate,
        changed: [...changed],
      };
      expect(parsed(outbox.appends[0], 'task.updated.v1')).toStrictEqual(expected);
    });

    it('carries the system actor of task-service when a removed member leaves the assignees', async () => {
      await events.taskUpdated(
        Task.restore(taskState({ version: 13, assigneeIds: [CAMILLE] })),
        ['assigneeIds'],
        taskService,
      );

      const expected: TaskUpdatedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482Scheduled,
        actor: { type: 'system', id: 'task-service' },
        version: 13,
        assigneeIds: [CAMILLE],
        changed: ['assigneeIds'],
      };
      expect(parsed(outbox.appends[0], 'task.updated.v1')).toStrictEqual(expected);
    });

    it('keeps the order of changed as given', async () => {
      await events.taskUpdated(
        Task.restore(taskState({ version: 13 })),
        ['priority', 'name'],
        camille,
      );

      expect(parsed(outbox.appends[0], 'task.updated.v1')).toMatchObject({
        changed: ['priority', 'name'],
      });
    });
  });

  describe('milestone and recurrence facts', () => {
    it('keeps scheduling values in created and updated snapshots and reports a reset', async () => {
      const task: Task = Task.restore(
        taskState({
          version: 1,
          status: 'todo',
          startDate: '2026-11-12',
          estimateMinutes: null,
          milestone: true,
          recurrence: 'weekly',
        }),
      );
      await events.taskCreated(task, camille);
      await events.taskUpdated(
        Task.restore({ ...task.snapshot, version: 2, milestone: false, recurrence: 'none' }),
        ['milestone', 'recurrence'],
        camille,
      );

      expect(parsed(outbox.appends[0], 'task.created.v1')).toMatchObject({
        milestone: true,
        recurrence: 'weekly',
      });
      expect(parsed(outbox.appends[1], 'task.updated.v1')).toMatchObject({
        milestone: false,
        recurrence: 'none',
        changed: ['milestone', 'recurrence'],
      });
    });

    it('appends a completed undated milestone and the supplied watcher audience', async () => {
      const task: Task = Task.restore(
        taskState({
          version: 13,
          status: 'done',
          startDate: null,
          dueDate: null,
          estimateMinutes: null,
          milestone: true,
          completedAt: new Date(OCCURRED_AT),
        }),
      );
      await events.milestoneReached(task, [INES], camille);

      const expected: MilestoneReachedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        organizationId: ATELIER_NORD,
        actor: camille,
        version: 13,
        key: 'CAD-482',
        spaceId: PRODUIT,
        listId: SPRINT_14,
        name: cad482.name,
        dueDate: null,
        completedAt: OCCURRED_AT,
        watcherIds: [INES],
      };
      const append: RecordedAppend | undefined = outbox.appends[0];
      expect(append?.transaction).toBe(transaction);
      expect(append?.schemas).toBe(eventSchemas);
      expect(append?.data).not.toHaveProperty('description');
      expect(append?.data).not.toHaveProperty('checklist');
      expect(parsed(append, 'milestone.reached.v1')).toStrictEqual(expected);
      expect(log).toEqual(['append milestone.reached.v1', 'wake']);
    });

    it('uses the predecessor version and the successor due date and key for the occurrence fact', async () => {
      const successorKey: TaskKey = TaskKey.of('CAD', 495);
      const predecessor: Task = Task.restore(
        taskState({
          version: 13,
          status: 'done',
          completedAt: new Date(OCCURRED_AT),
          recurrence: 'none',
          nextOccurrenceKey: successorKey,
        }),
      );
      const successor: Task = Task.restore(
        taskState({
          key: successorKey,
          version: 1,
          status: 'todo',
          dueDate: '2026-11-19',
          startDate: '2026-11-18',
          recurrence: 'weekly',
        }),
      );
      await events.taskOccurrenceCreated(predecessor, successor, 'weekly', camille);

      const expected: TaskOccurrenceCreatedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        organizationId: ATELIER_NORD,
        actor: camille,
        version: 13,
        predecessorKey: 'CAD-482',
        predecessorVersion: 13,
        successorKey: 'CAD-495',
        spaceId: PRODUIT,
        listId: SPRINT_14,
        dueDate: '2026-11-19',
        cadence: 'weekly',
      };
      const append: RecordedAppend | undefined = outbox.appends[0];
      expect(append?.transaction).toBe(transaction);
      expect(append?.schemas).toBe(eventSchemas);
      expect(append?.data).not.toHaveProperty('name');
      expect(append?.data).not.toHaveProperty('description');
      expect(append?.data).not.toHaveProperty('checklist');
      expect(parsed(append, 'task.occurrence-created.v1')).toStrictEqual(expected);
      expect(log).toEqual(['append task.occurrence-created.v1', 'wake']);
    });

    it('refuses to append a reached milestone without a completion instant', async () => {
      const task: Task = Task.restore(
        taskState({
          status: 'todo',
          milestone: true,
          startDate: '2026-11-12',
          estimateMinutes: null,
        }),
      );
      await expect(events.milestoneReached(task, [], camille)).rejects.toThrow(
        'requires a completion instant',
      );
      expect(log).toEqual([]);
    });

    it('refuses to append an occurrence without a successor due date', async () => {
      await expect(
        events.taskOccurrenceCreated(
          Task.restore(taskState()),
          Task.restore(subtaskState()),
          'weekly',
          camille,
        ),
      ).rejects.toThrow('requires a successor due date');
      expect(log).toEqual([]);
    });
  });

  describe('task.watcher-changed.v1', () => {
    it.each([true, false])(
      'publishes the effective override %s with the task version',
      async (following) => {
        const task = Task.restore(taskState({ version: 13 }));
        await events.taskWatcherChanged(task, { userId: HUGO, following }, camille);

        expect(parsed(outbox.appends[0], 'task.watcher-changed.v1')).toStrictEqual({
          id: EVENT_ID,
          occurredAt: OCCURRED_AT,
          organizationId: task.snapshot.organizationId,
          version: 13,
          key: 'CAD-482',
          spaceId: task.snapshot.spaceId,
          listId: task.snapshot.listId,
          actor: camille,
          userId: HUGO,
          requested: following ? 'follow' : 'unfollow',
          effectiveFollowing: following,
        });
      },
    );
  });

  describe('task.status-changed.v1', () => {
    it('carries the previous status, without cancel reason or note outside a cancellation', async () => {
      await events.taskStatusChanged(
        Task.restore(taskState({ version: 14, status: 'review' })),
        'progress',
        camille,
        [CAMILLE, HUGO],
      );

      const expected: TaskStatusChangedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482,
        version: 14,
        status: 'review',
        previousStatus: 'progress',
        cancelNote: null,
        watcherIds: [CAMILLE, HUGO],
      };
      expect(parsed(outbox.appends[0], 'task.status-changed.v1')).toStrictEqual(expected);
    });

    it('carries the cancel reason and the cancel note of a cancellation', async () => {
      await events.taskStatusChanged(cancelledWithNote, 'progress', camille, []);

      const expected: TaskStatusChangedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482,
        version: 13,
        status: 'cancelled',
        previousStatus: 'progress',
        cancelReason: 'duplicate',
        cancelNote: 'Doublon de CAD-470.',
        watcherIds: [],
      };
      expect(parsed(outbox.appends[0], 'task.status-changed.v1')).toStrictEqual(expected);
    });

    it('carries a cancel reason without a note as a null note', async () => {
      await events.taskStatusChanged(
        Task.restore(taskState({ version: 13, status: 'cancelled', cancelReason: 'obsolete' })),
        'todo',
        camille,
        [],
      );

      expect(parsed(outbox.appends[0], 'task.status-changed.v1')).toMatchObject({
        status: 'cancelled',
        previousStatus: 'todo',
        cancelReason: 'obsolete',
        cancelNote: null,
      });
    });

    it('carries completedAt as an ISO 8601 instant once the task is done', async () => {
      await events.taskStatusChanged(
        Task.restore(
          taskState({
            version: 14,
            status: 'done',
            completedAt: new Date('2026-11-08T10:20:00.000Z'),
          }),
        ),
        'review',
        camille,
        [],
      );

      expect(parsed(outbox.appends[0], 'task.status-changed.v1')).toMatchObject({
        status: 'done',
        previousStatus: 'review',
        completedAt: '2026-11-08T10:20:00.000Z',
      });
    });
  });

  describe('task.assigned.v1', () => {
    it('carries the person added and every assignee after the change', async () => {
      await events.taskAssigned(
        Task.restore(taskState({ version: 13, assigneeIds: [CAMILLE, INES, HUGO] })),
        HUGO,
        camille,
      );

      const expected: TaskAssignedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482,
        version: 13,
        assigneeId: HUGO,
        assigneeIds: [CAMILLE, INES, HUGO],
      };
      expect(parsed(outbox.appends[0], 'task.assigned.v1')).toStrictEqual(expected);
    });
  });

  describe('task.archived.v1 and task.unarchived.v1', () => {
    it('carries a task an archive took, as task.updated.v1 does without changed, with the key of the root', async () => {
      await events.taskArchived(
        Task.restore(subtaskState({ archive: archiveFrom(CAD_482), version: 2 })),
        TaskKey.of('CAD', 482),
        camille,
      );

      const expected: TaskArchivedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482,
        version: 2,
        key: 'CAD-483',
        rootKey: 'CAD-482',
        parentKey: 'CAD-482',
        name: 'Ajouter le bouton SSO',
        status: 'todo',
        priority: 'moyenne',
        assigneeIds: [CAMILLE],
        dueDate: null,
        startDate: null,
        estimateMinutes: null,
        labels: [],
      };
      expect(parsed(outbox.appends[0], 'task.archived.v1')).toStrictEqual(expected);
      expect(outbox.appends[0]?.data).not.toHaveProperty('changed');
    });

    it('carries a root restored and detached, its parentKey null and its own key as rootKey', async () => {
      await events.taskUnarchived(
        Task.restore(subtaskState({ parentId: null, parentKey: null, version: 3 })),
        TaskKey.of('CAD', 483),
        camille,
      );

      expect(parsed(outbox.appends[0], 'task.unarchived.v1')).toMatchObject({
        key: 'CAD-483',
        rootKey: 'CAD-483',
        parentKey: null,
        version: 3,
      });
      expect(log).toEqual(['append task.unarchived.v1', 'wake']);
    });
  });

  describe('task.trashed.v1, task.restored.v1 and task.purged.v1', () => {
    it('carries a task of a trash entry as it was, with the entry, the key of the root and the purge instant', async () => {
      await events.taskTrashed(
        Task.restore(subtaskState({ trash: trashIn(), version: 2 })),
        CAD_482_ENTRY,
        TaskKey.of('CAD', 482),
        new Date('2026-12-08T10:20:00.000Z'),
        camille,
      );

      const expected: TaskTrashedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...cad482,
        version: 2,
        key: 'CAD-483',
        entryId: CAD_482_ENTRY,
        rootKey: 'CAD-482',
        purgeAt: '2026-12-08T10:20:00.000Z',
        parentKey: 'CAD-482',
        name: 'Ajouter le bouton SSO',
        status: 'todo',
        priority: 'moyenne',
        assigneeIds: [CAMILLE],
        dueDate: null,
        startDate: null,
        estimateMinutes: null,
        labels: [],
      };
      expect(parsed(outbox.appends[0], 'task.trashed.v1')).toStrictEqual(expected);
      expect(outbox.appends[0]?.data).not.toHaveProperty('changed');
      expect(log).toEqual(['append task.trashed.v1', 'wake']);
    });

    it('carries a root restored and detached, with the entry it came from', async () => {
      await events.taskRestored(
        Task.restore(subtaskState({ parentId: null, parentKey: null, version: 3 })),
        CAD_482_ENTRY,
        TaskKey.of('CAD', 483),
        camille,
      );

      expect(parsed(outbox.appends[0], 'task.restored.v1')).toMatchObject({
        key: 'CAD-483',
        entryId: CAD_482_ENTRY,
        rootKey: 'CAD-483',
        parentKey: null,
        version: 3,
        archivedAt: null,
        archivedBy: null,
      });
    });

    it('carries the final archive state at the restoration version', async () => {
      const before = Task.restore(subtaskState({ archive: archiveFrom(CAD_482), version: 3 }));
      const after = before.rearchive({ type: 'user', id: CAMILLE }, new Date(OCCURRED_AT));
      await events.taskRestored(before, CAD_482_ENTRY, TaskKey.of('CAD', 482), camille, after);

      expect(parsed(outbox.appends[0], 'task.restored.v1')).toMatchObject({
        version: 3,
        archivedAt: OCCURRED_AT,
        archivedBy: camille,
      });
    });

    it('carries only the key, the version, the entry, the root, the list, the space and the parent of a task erased', async () => {
      await events.taskPurged(
        Task.restore(subtaskState({ trash: trashIn(), version: 3 })),
        CAD_482_ENTRY,
        TaskKey.of('CAD', 482),
        taskService,
      );

      const expected: TaskPurgedV1 = {
        id: EVENT_ID,
        occurredAt: OCCURRED_AT,
        organizationId: ATELIER_NORD,
        actor: { type: 'system', id: 'task-service' },
        version: 3,
        key: 'CAD-483',
        entryId: CAD_482_ENTRY,
        rootKey: 'CAD-482',
        spaceId: PRODUIT,
        listId: SPRINT_14,
        parentKey: 'CAD-482',
      };
      expect(parsed(outbox.appends[0], 'task.purged.v1')).toStrictEqual(expected);
      expect(Object.keys(outbox.appends[0]?.data ?? {}).sort()).toEqual(
        [
          'actor',
          'entryId',
          'key',
          'listId',
          'organizationId',
          'parentKey',
          'rootKey',
          'spaceId',
          'version',
        ].sort(),
      );
    });
  });

  describe('what never travels', () => {
    it('leaves out the description and the checklist of every event, and the cancel note outside task.status-changed.v1', async () => {
      await events.taskCreated(Task.restore(subtaskState({ description: 'Bouton.' })), camille);
      await events.taskUpdated(
        cancelledWithNote,
        ['status', 'cancelReason', 'cancelNote'],
        camille,
      );
      await events.taskStatusChanged(cancelledWithNote, 'progress', camille, []);
      await events.taskAssigned(cancelledWithNote, CAMILLE, camille);

      expect(outbox.appends.map((append) => append.name)).toEqual([
        'task.created.v1',
        'task.updated.v1',
        'task.status-changed.v1',
        'task.assigned.v1',
      ]);
      for (const append of outbox.appends) {
        expect(append.data).not.toHaveProperty('description');
        expect(append.data).not.toHaveProperty('checklist');
        expect(append.data).not.toHaveProperty('id');
        expect(append.data).not.toHaveProperty('occurredAt');
      }
      const notes: unknown[] = outbox.appends.map((append) =>
        'cancelNote' in append.data ? append.data.cancelNote : 'absent',
      );
      expect(notes).toEqual(['absent', 'absent', 'Doublon de CAD-470.', 'absent']);
    });
  });

  describe('waking the relay', () => {
    it('calls onAppend once after each append', async () => {
      const task: Task = Task.restore(taskState({ version: 13 }));

      await events.taskUpdated(task, ['status'], camille);
      await events.taskStatusChanged(task, 'todo', camille, []);
      await events.taskAssigned(task, INES, camille);

      expect(log).toEqual([
        'append task.updated.v1',
        'wake',
        'append task.status-changed.v1',
        'wake',
        'append task.assigned.v1',
        'wake',
      ]);
    });

    it('does not call onAppend when the append fails', async () => {
      const failure = new Error('the payload does not match the schema');
      outbox.failure = failure;

      await expect(
        events.taskCreated(Task.restore(taskState({ version: 1 })), camille),
      ).rejects.toBe(failure);

      expect(log).toEqual([]);
    });
  });
});
