import { describe, expect, it, vi } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import {
  CAMILLE,
  InMemorySpaceDirectory,
  InMemoryTasks,
  cad490State,
  taskState,
  trashIn,
} from '../../use-cases/tasks.fixture.js';
import { VisibleNextOccurrence } from './visible-next-occurrence.service.js';

const viewer = { userId: CAMILLE, role: 'owner' } as const;
const key = TaskKey.of('CAD', 490);

describe('VisibleNextOccurrence', () => {
  it('returns the successor key only while its live task and placement are visible', async () => {
    const source = Task.restore(taskState({ nextOccurrenceKey: key }));
    const tasks = new InMemoryTasks({ tasks: [source.snapshot, cad490State()] });
    const spaces = new InMemorySpaceDirectory();
    const resolver = new VisibleNextOccurrence(spaces);

    expect(await tasks.run((store) => resolver.keyOf(store, source, viewer))).toBe('CAD-490');
    vi.spyOn(spaces, 'findVisibleList').mockResolvedValue(null);
    expect(await tasks.run((store) => resolver.keyOf(store, source, viewer))).toBeUndefined();
  });

  it('does not reveal an erased or trashed successor', async () => {
    const source = Task.restore(taskState({ nextOccurrenceKey: key }));
    const resolver = new VisibleNextOccurrence(new InMemorySpaceDirectory());
    const missing = new InMemoryTasks({ tasks: [source.snapshot] });
    const trashed = new InMemoryTasks({
      tasks: [source.snapshot, cad490State({ trash: trashIn() })],
    });

    expect(await missing.run((store) => resolver.keyOf(store, source, viewer))).toBeUndefined();
    expect(await trashed.run((store) => resolver.keyOf(store, source, viewer))).toBeUndefined();
  });
});
