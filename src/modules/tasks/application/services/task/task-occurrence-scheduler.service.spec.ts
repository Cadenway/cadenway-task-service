import { describe, expect, it, vi } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import {
  ALL_STATUSES,
  CAMILLE,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NOW,
  taskState,
} from '../../use-cases/tasks.fixture.js';
import { TaskChangeWriter } from './task-change-writer.service.js';
import { TaskOccurrenceScheduler } from './task-occurrence-scheduler.service.js';

describe('TaskOccurrenceScheduler', () => {
  it('allocates one key, saves one predecessor version and writes its successor in the same store', async () => {
    const source = Task.restore(
      taskState({ recurrence: 'monthly', dueDate: '2027-01-31', startDate: null }),
    );
    const tasks = new InMemoryTasks({ tasks: [source.snapshot] });
    const spaces = new InMemorySpaceDirectory();
    const scheduler = new TaskOccurrenceScheduler(spaces);

    await tasks.run(async (store) => {
      const planned = await scheduler.prepare(source, { status: 'done' }, ALL_STATUSES, NOW);
      await new TaskChangeWriter().commit(store, source, planned.update, CAMILLE, NOW);
      await scheduler.createSuccessor(
        store,
        planned,
        ALL_STATUSES,
        [],
        { type: 'user', id: CAMILLE },
        NOW,
      );
    });

    const saved = tasks.stored(source.snapshot.id);
    expect(saved).toMatchObject({ version: 13, status: 'done', recurrence: 'none' });
    expect(saved.nextOccurrenceKey?.format()).toBe('CAD-496');
    expect(tasks.events.map((event) => event.kind)).toEqual([
      'updated',
      'statusChanged',
      'created',
      'occurrenceCreated',
    ]);
    expect([...tasks.tasks.values()].find((task) => task.key.format() === 'CAD-496')).toMatchObject(
      {
        dueDate: '2027-02-28',
        recurrence: 'monthly',
        monthlyAnchorDay: 31,
        version: 1,
      },
    );
  });

  it('does not reserve a key for an undated completion or a repeated done', async () => {
    const spaces = new InMemorySpaceDirectory();
    const allocate = vi.spyOn(spaces, 'allocateKeys');
    const scheduler = new TaskOccurrenceScheduler(spaces);
    const undated = Task.restore(
      taskState({ recurrence: 'weekly', dueDate: null, startDate: null }),
    );
    const done = Task.restore(
      taskState({ status: 'done', completedAt: NOW, recurrence: 'weekly', dueDate: '2027-01-31' }),
    );

    expect(
      (await scheduler.prepare(undated, { status: 'done' }, ALL_STATUSES, NOW)).successor,
    ).toBe(null);
    expect((await scheduler.prepare(done, { status: 'done' }, ALL_STATUSES, NOW)).successor).toBe(
      null,
    );
    expect(allocate).not.toHaveBeenCalled();
  });
});
