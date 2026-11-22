import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAMILLE,
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
  archiveFrom,
  ARCHIVED_AT,
  HUGO_ACTOR,
  atelierNordLists,
} from '../../../tasks.fixture.js';
import type { GetListCountsInput } from './get-list-counts.input.js';
import { GetListCounts } from './get-list-counts.use-case.js';

/**
 * Builds the reading of the counts of Sprint 14 by Camille Martin on 2026-11-08.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<GetListCountsInput> = {}): GetListCountsInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    listId: SPRINT_14,
    today: '2026-11-08',
    ...overrides,
  };
}

/**
 * Builds the store of Sprint 14: seven top-level tasks and a subtask, plus a task of Bugs.
 *
 * - CAD-482 progress, due 2026-11-12: open.
 * - CAD-801 todo, due 2026-11-07: open and late.
 * - CAD-802 blocked, due 2026-11-08: open, not late (due today).
 * - CAD-803 todo, no due date: open.
 * - CAD-804 done, due 2026-11-01: done, not late.
 * - CAD-805 cancelled, due 2026-11-01: cancelled, not late.
 * - CAD-483, a late subtask, left out of the counts.
 *
 * @returns The fake unit of work.
 */
function sprint14(): InMemoryTasks {
  const closedAt = new Date('2026-11-02T10:00:00Z');
  return new InMemoryTasks({
    tasks: [
      taskState(),
      subtaskState({ dueDate: '2026-11-01', startDate: null }),
      queryTask(1, { dueDate: '2026-11-07' }),
      queryTask(2, { status: 'blocked', dueDate: '2026-11-08' }),
      queryTask(3),
      queryTask(4, { status: 'done', dueDate: '2026-11-01', completedAt: closedAt }),
      queryTask(5, { status: 'cancelled', dueDate: '2026-11-01', cancelReason: 'wontdo' }),
      queryTask(6, { listId: BUGS }),
    ],
  });
}

/**
 * Builds the use case over a store.
 *
 * @param tasks - The fake unit of work.
 * @returns The use case.
 */
function over(tasks: InMemoryTasks): GetListCounts {
  return new GetListCounts(tasks, atelierNordMembers(), new InMemorySpaceDirectory());
}

describe('GetListCounts: the list with the counts of its top-level tasks', () => {
  it('counts the open, done, cancelled and late tasks of the list, subtasks left out', async () => {
    const summary = await over(sprint14()).execute(read());

    expect(summary.list).toMatchObject({ id: SPRINT_14, name: 'Sprint 14' });
    expect(summary.counts).toEqual({ total: 6, open: 4, done: 1, cancelled: 1, late: 1 });
  });

  it('counts a task as late only when it is due strictly before today', async () => {
    const tomorrow = await over(sprint14()).execute(read({ today: '2026-11-09' }));
    const yesterday = await over(sprint14()).execute(read({ today: '2026-11-07' }));

    expect(tomorrow.counts.late).toBe(2);
    expect(yesterday.counts.late).toBe(0);
  });

  it('never counts a done or cancelled task as late, however old its due date', async () => {
    const summary = await over(sprint14()).execute(read({ today: '2027-01-01' }));

    expect(summary.counts).toMatchObject({ open: 4, late: 3, done: 1, cancelled: 1 });
  });

  it('answers zeros for a list without a task', async () => {
    const summary = await over(new InMemoryTasks()).execute(read());

    expect(summary.counts).toEqual({ total: 0, open: 0, done: 0, cancelled: 0, late: 0 });
  });

  it('reads the counts of the list only, in one statement', async () => {
    const tasks = sprint14();

    await over(tasks).execute(read());

    expect(tasks.reads.counts).toEqual([[SPRINT_14]]);
  });
});

describe('GetListCounts: what the actor does not see is not found', () => {
  it.each([
    ['an unknown list', { listId: UNKNOWN_LIST }],
    ['a list not shared with a guest', { actorUserId: NADIA }],
    ['a list of the private space of another member', { listId: MAQUETTES }],
  ] as const)('refuses %s as list-not-found, before counting', async (_name, overrides) => {
    const tasks = sprint14();

    expect(await refusalOf(over(tasks).execute(read(overrides)))).toEqual({
      reason: 'list-not-found',
    });
    expect(tasks.reads.counts).toEqual([]);
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    expect(await refusalOf(over(sprint14()).execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('GetListCounts: visibility and counts share a read-only snapshot', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = sprint14();

    await over(tasks).execute(read());

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(1);
  });
});

describe('GetListCounts: an archived task is not counted, an archived list still reads', () => {
  it('counts the live top-level tasks and answers the list with its archive', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState(),
        queryTask(1, {
          assigneeIds: [CAMILLE],
          labels: ['Archivé'],
          dueDate: '2026-11-08',
          archive: archiveFrom(queryTask(1).id),
          version: 2,
        }),
        queryTask(2, { assigneeIds: [CAMILLE], dueDate: '2026-11-08' }),
      ],
    });
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR }),
    });

    const counts = await new GetListCounts(tasks, atelierNordMembers(), spaces).execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      listId: SPRINT_14,
      today: '2026-11-08',
    });

    expect(counts.counts.total).toBe(2);
    expect(counts.list).toMatchObject({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR });
  });
});
