import { describe, expect, it } from 'vitest';

import type { TaskFilterInput } from '../../../../models/query/task-filter-input.model.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAMILLE,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  MAQUETTES,
  NADIA,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  atelierNordMembers,
  queryTask,
  refusalOf,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { ListListTasksInput } from './list-list-tasks.input.js';
import { ListListTasks } from './list-list-tasks.use-case.js';

/** The filters of a request that sends none. */
const NO_FILTER: TaskFilterInput = {
  statuses: null,
  priorities: null,
  assignees: null,
  labels: null,
  search: null,
  dueFrom: null,
  dueTo: null,
  level: 'roots',
};

/**
 * Builds the reading of the first page of Sprint 14 by Camille Martin, in the order of the list.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<ListListTasksInput> = {}): ListListTasksInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    listId: SPRINT_14,
    filter: NO_FILTER,
    order: { key: 'manual', descending: false },
    after: null,
    limit: 10,
    ...overrides,
  };
}

/**
 * Builds the store of Sprint 14: CAD-801 to CAD-804 and the subtask CAD-483 of CAD-482, plus a
 * task of Bugs.
 *
 * @returns The fake unit of work.
 */
function sprint14(): InMemoryTasks {
  return new InMemoryTasks({
    tasks: [
      taskState({ assigneeIds: [CAMILLE, INES], labels: ['Auth', 'Front'] }),
      subtaskState({ assigneeIds: [CAMILLE] }),
      queryTask(1, { assigneeIds: [CAMILLE], status: 'progress', labels: ['Auth'] }),
      queryTask(2, { assigneeIds: [], status: 'progress' }),
      queryTask(3, { assigneeIds: [INES], status: 'done', completedAt: new Date() }),
      queryTask(4, { listId: BUGS }),
    ],
  });
}

/**
 * Builds the use case over a store.
 *
 * @param tasks - The fake unit of work.
 * @returns The use case.
 */
function over(tasks: InMemoryTasks): ListListTasks {
  return new ListListTasks(tasks, atelierNordMembers(), new InMemorySpaceDirectory());
}

describe('ListListTasks: the tasks of a list, filtered and sorted', () => {
  it('reads the top-level tasks of the list in the order of its creation, with the total', async () => {
    const page = await over(sprint14()).execute(read());

    expect(page.items.map((item) => item.key)).toEqual([
      'CAD-482',
      'CAD-801',
      'CAD-802',
      'CAD-803',
    ]);
    expect(page.total).toBe(4);
    expect(page.next).toBeNull();
  });

  it('keeps the subtasks as tasks with level all', async () => {
    const page = await over(sprint14()).execute(read({ filter: { ...NO_FILTER, level: 'all' } }));

    expect(page.items.map((item) => item.key)).toContain('CAD-483');
    expect(page.total).toBe(5);
  });

  it('resolves me to the actor and none to the unassigned tasks before it reads', async () => {
    const tasks = sprint14();

    const page = await over(tasks).execute(
      read({ filter: { ...NO_FILTER, assignees: ['me', 'none'] } }),
    );

    expect(tasks.reads.pages[0]?.filter.assignees).toEqual({
      userIds: [CAMILLE],
      unassigned: true,
    });
    expect(page.items.map((item) => item.key)).toEqual(['CAD-482', 'CAD-801', 'CAD-802']);
  });

  it('adds the values of a filter and narrows with the next one', async () => {
    const page = await over(sprint14()).execute(
      read({
        filter: {
          ...NO_FILTER,
          statuses: ['progress', 'done'],
          labels: ['AUTH'],
          priorities: ['haute', 'moyenne'],
        },
      }),
    );

    expect(page.items.map((item) => item.key)).toEqual(['CAD-482', 'CAD-801']);
    expect(page.total).toBe(2);
  });

  it('hands the labels to the reader as keys, so that case does not matter', async () => {
    const tasks = sprint14();

    await over(tasks).execute(
      read({ filter: { ...NO_FILTER, labels: ['Auth', ' AUTH', 'Front'] } }),
    );

    expect(tasks.reads.pages[0]?.filter.labelKeys).toEqual(['auth', 'front']);
  });

  it('hands the order to the reader unchanged', async () => {
    const tasks = sprint14();

    await over(tasks).execute(read({ order: { key: 'dueDate', descending: true } }));

    expect(tasks.reads.pages[0]?.order).toEqual({ key: 'dueDate', descending: true });
  });

  it('reads one row more than the page to know whether another follows', async () => {
    const tasks = sprint14();

    await over(tasks).execute(read({ limit: 3 }));

    expect(tasks.reads.pages[0]?.limit).toBe(4);
  });

  it('walks the pages with the position of the last task, the total staying the same', async () => {
    const useCase = over(sprint14());

    const first = await useCase.execute(read({ limit: 3 }));
    const second = await useCase.execute(read({ limit: 3, after: first.next }));

    expect(first.items.map((item) => item.key)).toEqual(['CAD-482', 'CAD-801', 'CAD-802']);
    expect(first.next).toMatchObject({ id: '019a7200-0000-7000-8000-000000000802' });
    expect(second.items.map((item) => item.key)).toEqual(['CAD-803']);
    expect(second.next).toBeNull();
    expect([first.total, second.total]).toEqual([4, 4]);
  });

  it('gives each task as a summary with its assignees, labels and subtask counts', async () => {
    const page = await over(sprint14()).execute(read({ limit: 1 }));

    expect(page.items[0]).toMatchObject({
      key: 'CAD-482',
      assigneeIds: [CAMILLE, INES],
      labels: ['Auth', 'Front'],
      subtaskCounts: { total: 1, closed: 0 },
      listId: SPRINT_14,
    });
  });
});

describe('ListListTasks: what the actor does not see is not found', () => {
  it.each([
    ['an unknown list', { listId: UNKNOWN_LIST }],
    ['any list, for a guest', { actorUserId: NADIA }],
    ['a list of the private space of another member', { listId: MAQUETTES }],
  ] as const)('refuses %s as list-not-found, before reading any task', async (_name, overrides) => {
    const tasks = sprint14();

    expect(await refusalOf(over(tasks).execute(read(overrides)))).toEqual({
      reason: 'list-not-found',
    });
    expect(tasks.reads.pages).toEqual([]);
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    expect(await refusalOf(over(sprint14()).execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });

  it('does not read the tasks of another organization', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        queryTask(1, { organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99' }),
        queryTask(2),
      ],
    });

    const page = await over(tasks).execute(read());

    expect(page.items.map((item) => item.key)).toEqual(['CAD-802']);
    expect(page.total).toBe(1);
  });
});

describe('ListListTasks: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ id: CAD_482 })] });

    await over(tasks).execute(read());

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
  });
});
