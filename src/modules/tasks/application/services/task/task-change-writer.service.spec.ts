import { describe, expect, it } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import {
  ALL_STATUSES,
  CAMILLE,
  InMemoryTasks,
  NOW,
  taskState,
} from '../../use-cases/tasks.fixture.js';
import { TaskChangeWriter } from './task-change-writer.service.js';

describe('TaskChangeWriter', () => {
  it('refuses to persist a recurrence preview without an allocated successor', async () => {
    const task = Task.restore(
      taskState({ recurrence: 'weekly', dueDate: '2026-11-12', startDate: null }),
    );
    const tasks = new InMemoryTasks({ tasks: [task.snapshot] });
    const preview = task.update({ status: 'done' }, ALL_STATUSES, NOW);
    expect(preview.nextOccurrence).toBeDefined();

    await expect(
      tasks.run((store) => new TaskChangeWriter().commit(store, task, preview, CAMILLE, NOW)),
    ).rejects.toThrow('allocated successor key');
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
    expect(tasks.stored(task.snapshot.id)).toEqual(task.snapshot);
  });
});
