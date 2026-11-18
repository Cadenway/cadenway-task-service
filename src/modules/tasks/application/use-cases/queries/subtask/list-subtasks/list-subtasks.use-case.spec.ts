import { describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import {
  ATELIER_NORD,
  CAMILLE,
  CREATED_AT,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  atelierNordMembers,
  refusalOf,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { ListSubtasksInput } from './list-subtasks.input.js';
import { ListSubtasks } from './list-subtasks.use-case.js';

/**
 * Builds the reading of the first page of the subtasks of CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<ListSubtasksInput> = {}): ListSubtasksInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    after: null,
    limit: 2,
    ...overrides,
  };
}

/** CAD-482 with its three subtasks CAD-501, CAD-502 and CAD-503, created one second apart. */
function atelierNord(): ListSubtasks {
  const children = [1, 2, 3].map((index) =>
    subtaskState({
      id: `019a7200-0000-7000-8000-00000000050${String(index)}`,
      key: TaskKey.of('CAD', 500 + index),
      createdAt: new Date(CREATED_AT.getTime() + index * 1000),
      status: index === 1 ? 'done' : 'todo',
      completedAt: index === 1 ? CREATED_AT : null,
    }),
  );
  return new ListSubtasks(
    new InMemoryTasks({ tasks: [taskState(), ...children] }),
    atelierNordMembers(),
    new InMemorySpaceDirectory(),
  );
}

describe('ListSubtasks: the direct subtasks in the order of their creation', () => {
  it('reads the first page with where the next one starts and the total', async () => {
    const page = await atelierNord().execute(read());

    expect(page.items.map((item) => item.key)).toEqual(['CAD-501', 'CAD-502']);
    expect(page.next).toEqual({
      createdAt: new Date(CREATED_AT.getTime() + 2000),
      id: '019a7200-0000-7000-8000-000000000502',
    });
    expect(page.total).toBe(3);
  });

  it('reads the next page from the position of the last row, with no further page', async () => {
    const useCase = atelierNord();
    const first = await useCase.execute(read());

    const page = await useCase.execute(read({ after: first.next }));

    expect(page.items.map((item) => item.key)).toEqual(['CAD-503']);
    expect(page.next).toBeNull();
    expect(page.total).toBe(3);
  });

  it('gives the summary of a subtask, with the closed ones counted by the parent', async () => {
    const page = await atelierNord().execute(read({ limit: 10 }));

    expect(page.items[0]).toMatchObject({ key: 'CAD-501', status: 'done', parentKey: 'CAD-482' });
    expect(page.items).toHaveLength(3);
  });

  it('has an empty page for a task without subtask', async () => {
    const page = await atelierNord().execute(read({ taskKey: 'CAD-501' }));

    expect(page).toEqual({ items: [], next: null, total: 0 });
  });
});

describe('ListSubtasks: what the actor does not see is not found', () => {
  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['any task, for a guest', { actorUserId: NADIA }],
  ] as const)('refuses %s', async (_name, overrides) => {
    expect(await refusalOf(atelierNord().execute(read(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });
});

describe('ListSubtasks: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });

    await new ListSubtasks(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute(
      read(),
    );

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
  });
});
