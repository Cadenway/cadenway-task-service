import { describe, expect, it } from 'vitest';

import { PRIORITY_KEYS } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import { STATUS_KEYS } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import type { TaskFilterInput } from '../../../../models/query/task-filter-input.model.js';
import {
  ATELIER_NORD,
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
import type { CountListTaskGroupsInput } from './count-list-task-groups.input.js';
import { CountListTaskGroups } from './count-list-task-groups.use-case.js';

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
 * Builds the reading of the first page of the groups of Sprint 14 by status, by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<CountListTaskGroupsInput> = {}): CountListTaskGroupsInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    listId: SPRINT_14,
    grouping: 'status',
    filter: NO_FILTER,
    after: null,
    limit: 100,
    ...overrides,
  };
}

/**
 * Builds the store of Sprint 14: CAD-482 (progress, haute, Camille and Inès), CAD-801 (todo,
 * Camille), CAD-802 (todo, nobody), CAD-803 (done, basse, Inès) and the subtask CAD-483 (todo,
 * Camille).
 *
 * @returns The fake unit of work.
 */
function sprint14(): InMemoryTasks {
  return new InMemoryTasks({
    tasks: [
      taskState({ assigneeIds: [CAMILLE, INES] }),
      subtaskState({ assigneeIds: [CAMILLE] }),
      queryTask(1, { assigneeIds: [CAMILLE] }),
      queryTask(2),
      queryTask(3, {
        status: 'done',
        priority: 'basse',
        assigneeIds: [INES],
        completedAt: new Date(),
      }),
    ],
  });
}

/**
 * Builds the use case over a store.
 *
 * @param tasks - The fake unit of work.
 * @returns The use case.
 */
function over(tasks: InMemoryTasks): CountListTaskGroups {
  return new CountListTaskGroups(tasks, atelierNordMembers(), new InMemorySpaceDirectory());
}

describe('CountListTaskGroups: the tasks of a list counted by group', () => {
  it('counts by status with the ten keys in the order of the workflow, zeros included', async () => {
    const page = await over(sprint14()).execute(read());

    expect(page.grouping).toBe('status');
    expect(page.items.map((group) => group.value)).toEqual(STATUS_KEYS);
    expect(page.items.filter((group) => group.count > 0)).toEqual([
      { value: 'todo', count: 2 },
      { value: 'progress', count: 1 },
      { value: 'done', count: 1 },
    ]);
    expect(page.next).toBeNull();
  });

  it('counts each task once in the total, the subtasks left out by default', async () => {
    const page = await over(sprint14()).execute(read());

    expect(page.total).toBe(4);
  });

  it('counts the subtasks with level all', async () => {
    const page = await over(sprint14()).execute(read({ filter: { ...NO_FILTER, level: 'all' } }));

    expect(page.total).toBe(5);
    expect(page.items.find((group) => group.value === 'todo')?.count).toBe(3);
  });

  it('counts by priority from urgente to basse, zeros included', async () => {
    const page = await over(sprint14()).execute(read({ grouping: 'priority' }));

    expect(page.items.map((group) => group.value)).toEqual(PRIORITY_KEYS);
    expect(page.items.map((group) => group.count)).toEqual([0, 1, 2, 1]);
    expect(page.total).toBe(4);
  });

  it('narrows the groups with the filters, the other statuses staying at zero', async () => {
    const page = await over(sprint14()).execute(
      read({ filter: { ...NO_FILTER, statuses: ['todo'] } }),
    );

    expect(page.items.filter((group) => group.count > 0)).toEqual([{ value: 'todo', count: 2 }]);
    expect(page.items).toHaveLength(10);
    expect(page.total).toBe(2);
  });

  it('resolves me to the actor before it reads', async () => {
    const tasks = sprint14();

    const page = await over(tasks).execute(read({ filter: { ...NO_FILTER, assignees: ['me'] } }));

    expect(page.total).toBe(2);
    expect(page.items.find((group) => group.value === 'todo')?.count).toBe(1);
  });

  it('counts by assignee, the most tasks first, ties by account id, a task counting for each assignee', async () => {
    const page = await over(sprint14()).execute(read({ grouping: 'assignee' }));

    expect(page.items).toEqual([
      { value: CAMILLE, count: 2 },
      { value: INES, count: 2 },
      { value: 'none', count: 1 },
    ]);
    expect(page.total).toBe(4);
  });

  it('puts the group with the most tasks first, none staying last', async () => {
    const page = await over(sprint14()).execute(
      read({ grouping: 'assignee', filter: { ...NO_FILTER, level: 'all' } }),
    );

    expect(page.items.map((group) => group.value)).toEqual([CAMILLE, INES, 'none']);
    expect(page.items.map((group) => group.count)).toEqual([3, 2, 1]);
    expect(page.total).toBe(5);
  });

  it('answers the group none with 0 when every task is assigned', async () => {
    const tasks = new InMemoryTasks({ tasks: [queryTask(1, { assigneeIds: [CAMILLE] })] });

    const page = await over(tasks).execute(read({ grouping: 'assignee' }));

    expect(page.items).toEqual([
      { value: CAMILLE, count: 1 },
      { value: 'none', count: 0 },
    ]);
  });

  it('answers only none, with 0, for an empty list', async () => {
    const page = await over(new InMemoryTasks()).execute(read({ grouping: 'assignee' }));

    expect(page).toEqual({
      grouping: 'assignee',
      items: [{ value: 'none', count: 0 }],
      next: null,
      total: 0,
    });
  });

  it('counts the tasks once with a statement of its own only for the assignees', async () => {
    const byStatus = sprint14();
    const byAssignee = sprint14();

    await over(byStatus).execute(read());
    await over(byAssignee).execute(read({ grouping: 'assignee' }));

    expect(byStatus.trace).not.toContain('queries.countOfList');
    expect(byAssignee.trace).toContain('queries.countOfList');
  });
});

describe('CountListTaskGroups: the groups are paged from the position of the last one', () => {
  it('walks the statuses in the order of the workflow', async () => {
    const useCase = over(sprint14());

    const first = await useCase.execute(read({ limit: 4 }));
    const second = await useCase.execute(read({ limit: 4, after: first.next }));
    const third = await useCase.execute(read({ limit: 4, after: second.next }));

    expect(first.items.map((group) => group.value)).toEqual([
      'triage',
      'backlog',
      'todo',
      'progress',
    ]);
    expect(first.next).toEqual({ value: 'progress', count: 1 });
    expect(second.items.map((group) => group.value)).toEqual([
      'review',
      'testing',
      'waiting',
      'blocked',
    ]);
    expect(third.items.map((group) => group.value)).toEqual(['done', 'cancelled']);
    expect(third.next).toBeNull();
    expect([first.total, second.total, third.total]).toEqual([4, 4, 4]);
  });

  it('walks the assignees by count then account id, none last', async () => {
    const useCase = over(sprint14());

    const first = await useCase.execute(read({ grouping: 'assignee', limit: 1 }));
    const second = await useCase.execute(
      read({ grouping: 'assignee', limit: 1, after: first.next }),
    );
    const third = await useCase.execute(
      read({ grouping: 'assignee', limit: 1, after: second.next }),
    );

    expect(first.items).toEqual([{ value: CAMILLE, count: 2 }]);
    expect(first.next).toEqual({ value: CAMILLE, count: 2 });
    expect(second.items).toEqual([{ value: INES, count: 2 }]);
    expect(third.items).toEqual([{ value: 'none', count: 1 }]);
    expect(third.next).toBeNull();
  });
});

describe('CountListTaskGroups: what the actor does not see is not found', () => {
  it.each([
    ['an unknown list', { listId: UNKNOWN_LIST }],
    ['any list, for a guest', { actorUserId: NADIA }],
    ['a list of the private space of another member', { listId: MAQUETTES }],
  ] as const)('refuses %s as list-not-found, before counting', async (_name, overrides) => {
    const tasks = sprint14();

    expect(await refusalOf(over(tasks).execute(read(overrides)))).toEqual({
      reason: 'list-not-found',
    });
    expect(tasks.reads.groups).toEqual([]);
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    expect(await refusalOf(over(sprint14()).execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('CountListTaskGroups: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = sprint14();

    await over(tasks).execute(read());

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
  });
});
