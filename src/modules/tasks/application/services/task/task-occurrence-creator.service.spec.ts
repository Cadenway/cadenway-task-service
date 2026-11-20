import { describe, expect, it } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import {
  ALL_STATUSES,
  CAMILLE,
  INES,
  NADIA,
  NOW,
  InMemoryTasks,
  taskState,
} from '../../use-cases/tasks.fixture.js';
import { TaskOccurrenceCreator } from './task-occurrence-creator.service.js';

const actor = { type: 'user', id: CAMILLE } as const;
const schedule = {
  recurrence: 'monthly',
  monthlyAnchorDay: 31,
  dueDate: '2027-02-28',
  startDate: '2027-02-27',
} as const;
const key = TaskKey.of('CAD', 496);

/** A completed source whose successor was reserved by the caller. */
function source(): Task {
  return Task.restore(
    taskState({
      status: 'done',
      completedAt: NOW,
      dueDate: '2027-01-31',
      startDate: '2027-01-30',
      recurrence: 'none',
      nextOccurrenceKey: key,
      checklist: [
        { id: 'item-first', text: 'First', done: true, position: 0 },
        { id: 'item-second', text: 'Second', done: false, position: 1 },
      ],
      assigneeIds: [CAMILLE, INES, NADIA],
    }),
  );
}

describe('TaskOccurrenceCreator', () => {
  it('creates an unticked version-one root, keeping only currently assignable users', async () => {
    const predecessor = source();
    const tasks = new InMemoryTasks({ tasks: [predecessor.snapshot] });
    const result = await tasks.run((store) =>
      new TaskOccurrenceCreator().create(
        store,
        predecessor,
        schedule,
        key,
        ALL_STATUSES,
        [
          { userId: CAMILLE, role: 'owner' },
          { userId: INES, role: 'member' },
          { userId: NADIA, role: 'guest' },
        ],
        actor,
        NOW,
      ),
    );

    expect(result.snapshot).toMatchObject({
      key,
      parentId: null,
      status: 'todo',
      version: 1,
      completedAt: null,
      assigneeIds: [CAMILLE, INES],
      recurrence: 'monthly',
      monthlyAnchorDay: 31,
      dueDate: '2027-02-28',
      startDate: '2027-02-27',
      checklist: [
        { text: 'First', done: false, position: 0 },
        { text: 'Second', done: false, position: 1 },
      ],
    });
    expect(result.snapshot.checklist.map((item) => item.id)).not.toEqual([
      'item-first',
      'item-second',
    ]);
    expect(tasks.events).toMatchObject([
      { kind: 'created', key: 'CAD-496', version: 1 },
      { kind: 'assigned', key: 'CAD-496', assigneeId: CAMILLE },
      { kind: 'assigned', key: 'CAD-496', assigneeId: INES },
      {
        kind: 'occurrenceCreated',
        key: 'CAD-482',
        successorKey: 'CAD-496',
        cadence: 'monthly',
      },
    ]);
    expect(tasks.entriesOf(result.snapshot.id)).toHaveLength(1);
  });

  it('rolls the successor and creation history back when its occurrence fact cannot be recorded', async () => {
    const predecessor = source();
    const tasks = new InMemoryTasks({ tasks: [predecessor.snapshot] });

    await expect(
      tasks.run((store) =>
        new TaskOccurrenceCreator().create(
          {
            ...store,
            events: {
              ...store.events,
              taskOccurrenceCreated: () => Promise.reject(new Error('outbox failed')),
            },
          },
          predecessor,
          schedule,
          key,
          ALL_STATUSES,
          [{ userId: CAMILLE, role: 'owner' }],
          actor,
          NOW,
        ),
      ),
    ).rejects.toThrow('outbox failed');
    expect(tasks.tasks.size).toBe(1);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });
});
