import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAMILLE,
  DESIGN,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  atelierNordMembers,
  placedList,
  queryTask,
  refusalOf,
  subtaskState,
  taskState,
  archiveFrom,
  ARCHIVED_AT,
  HUGO_ACTOR,
  atelierNordLists,
} from '../../../tasks.fixture.js';
import type { GetSpaceOverviewInput } from './get-space-overview.input.js';
import { GetSpaceOverview } from './get-space-overview.use-case.js';

/** A space id no space has. */
const UNKNOWN_SPACE = '019a7000-0000-7000-8000-0000000000ff';

/**
 * Builds the reading of the first page of the overview of "Produit" by Camille Martin on
 * 2026-11-08.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<GetSpaceOverviewInput> = {}): GetSpaceOverviewInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    spaceId: PRODUIT,
    today: '2026-11-08',
    after: null,
    limit: 10,
    ...overrides,
  };
}

/**
 * Builds the store of "Produit": three top-level tasks and a subtask in Sprint 14, one task in
 * Bugs, and one in the private space "Design", which the count of "Produit" never reads.
 *
 * @returns The fake unit of work.
 */
function produit(): InMemoryTasks {
  return new InMemoryTasks({
    tasks: [
      taskState(),
      subtaskState({ dueDate: '2026-11-01', startDate: null }),
      queryTask(1, { dueDate: '2026-11-07' }),
      queryTask(2, { status: 'done', completedAt: new Date('2026-11-03T10:00:00Z') }),
      queryTask(3, { listId: BUGS }),
      queryTask(4, {
        listId: '019a7100-0000-7000-8000-000000000004',
        spaceId: DESIGN,
      }),
    ],
  });
}

/**
 * Builds the use case over a store.
 *
 * @param tasks - The fake unit of work.
 * @param spaces - The fake spaces.
 * @returns The use case.
 */
function over(tasks: InMemoryTasks, spaces = new InMemorySpaceDirectory()): GetSpaceOverview {
  return new GetSpaceOverview(tasks, atelierNordMembers(), spaces);
}

describe('GetSpaceOverview: the lists of a space with the counts of their top-level tasks', () => {
  it('reads the lists in the order of their creation with the counts of their top-level tasks', async () => {
    const overview = await over(produit()).execute(read());

    expect(overview.spaceId).toBe(PRODUIT);
    expect(overview.items.map((item) => item.list.id)).toEqual([SPRINT_14, BUGS]);
    expect(overview.items[0]?.counts).toEqual({
      total: 3,
      open: 2,
      done: 1,
      cancelled: 0,
      late: 1,
    });
    expect(overview.items[1]?.counts).toEqual({
      total: 1,
      open: 1,
      done: 0,
      cancelled: 0,
      late: 0,
    });
    expect(overview.next).toBeNull();
  });

  it('counts the lists and the top-level tasks of the whole space', async () => {
    const overview = await over(produit()).execute(read());

    expect(overview.listCount).toBe(2);
    expect(overview.taskCount).toBe(4);
  });

  it('gives zeros to a list without a task', async () => {
    const overview = await over(new InMemoryTasks()).execute(read());

    expect(overview.items.map((item) => item.counts.total)).toEqual([0, 0]);
    expect(overview.taskCount).toBe(0);
    expect(overview.listCount).toBe(2);
  });

  it('walks the pages from the position of the last list, the totals covering the space on each', async () => {
    const useCase = over(produit());

    const first = await useCase.execute(read({ limit: 1 }));
    const second = await useCase.execute(read({ limit: 1, after: first.next }));

    expect(first.items.map((item) => item.list.id)).toEqual([SPRINT_14]);
    expect(first.next).toEqual({ createdAt: placedList().createdAt, id: SPRINT_14 });
    expect(second.items.map((item) => item.list.id)).toEqual([BUGS]);
    expect(second.next).toBeNull();
    expect([first.listCount, second.listCount]).toEqual([2, 2]);
    expect([first.taskCount, second.taskCount]).toEqual([4, 4]);
  });

  it('reads the counts of every list of the space in one statement, whatever the page', async () => {
    const tasks = produit();

    await over(tasks).execute(read({ limit: 1 }));

    expect(tasks.reads.counts).toEqual([[SPRINT_14, BUGS]]);
  });

  it('shows the private space to its owner', async () => {
    const overview = await new GetSpaceOverview(
      produit(),
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    ).execute(read({ actorUserId: HUGO, spaceId: DESIGN }));

    expect(overview.listCount).toBe(1);
    expect(overview.taskCount).toBe(1);
  });
});

describe('GetSpaceOverview: the lists of the space the actor has a role on', () => {
  it('shows a guest the lists of the space shared with them only, with their role', async () => {
    const tasks = produit();
    const spaces = new InMemorySpaceDirectory({ listGrants: { [BUGS]: { [NADIA]: 'comment' } } });

    const overview = await over(tasks, spaces).execute(read({ actorUserId: NADIA }));

    expect(overview.items.map((item) => [item.list.id, item.list.callerRole])).toEqual([
      [BUGS, 'comment'],
    ]);
    expect(overview).toMatchObject({ listCount: 1, taskCount: 1 });
    expect(tasks.reads.counts).toEqual([[BUGS]]);
  });

  it('leaves out a list closed to the organization for a member it is not shared with', async () => {
    const spaces = new InMemorySpaceDirectory({
      lists: [placedList({ organizationAccess: false }), placedList({ id: BUGS, sprint: null })],
    });

    const overview = await over(produit(), spaces).execute(read({ actorUserId: HUGO }));

    expect(overview.items.map((item) => item.list.id)).toEqual([BUGS]);
  });
});

describe('GetSpaceOverview: what the actor does not see is not found', () => {
  it.each([
    ['an unknown space', { spaceId: UNKNOWN_SPACE }],
    ['a space with no list shared with a guest', { actorUserId: NADIA }],
    ['the private space of another member', { spaceId: DESIGN }],
  ] as const)('refuses %s as space-not-found, before counting', async (_name, overrides) => {
    const tasks = produit();

    expect(await refusalOf(over(tasks).execute(read(overrides)))).toEqual({
      reason: 'space-not-found',
    });
    expect(tasks.reads.counts).toEqual([]);
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    expect(await refusalOf(over(produit()).execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('GetSpaceOverview: the read runs in one read-only transaction on one snapshot', () => {
  it('opens a single read-only run with a snapshot', async () => {
    const tasks = produit();

    await over(tasks).execute(read());

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(1);
  });
});

describe('GetSpaceOverview: archived tasks and lists are left out', () => {
  it('leaves an archived task out of the counts and an archived list out of the lists', async () => {
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
        queryTask(3, { listId: BUGS }),
      ],
    });
    const useCase = new GetSpaceOverview(tasks, atelierNordMembers(), new InMemorySpaceDirectory());
    const archivedSprint = new GetSpaceOverview(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory({
        lists: atelierNordLists({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR }),
      }),
    );
    const input = {
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      spaceId: PRODUIT,
      today: '2026-11-08',
      after: null,
      limit: 50,
    };

    const live = await useCase.execute(input);
    const withoutSprint = await archivedSprint.execute(input);

    expect(live.taskCount).toBe(3);
    expect(withoutSprint.items.map((item) => item.list.id)).toEqual([BUGS]);
    expect(withoutSprint).toMatchObject({ listCount: 1, taskCount: 1 });
  });
});
