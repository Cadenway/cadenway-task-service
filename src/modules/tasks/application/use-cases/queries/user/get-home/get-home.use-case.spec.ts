import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAMILLE,
  DESIGN,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  MAQUETTES,
  NADIA,
  SPRINT_14,
  STRANGER,
  atelierNordMembers,
  placedList,
  queryTask,
  refusalOf,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { GetHomeInput } from './get-home.input.js';
import { GetHome } from './get-home.use-case.js';

/** The sprint "Sprint 12", over on 2026-11-08. */
const SPRINT_12 = '019a7100-0000-7000-8000-000000000012';

/** The sprint "Sprint 13", from 2026-11-04 to 2026-11-10: current on 2026-11-08, ending first. */
const SPRINT_13 = '019a7100-0000-7000-8000-000000000013';

/**
 * Builds the reading of "Accueil" by Camille Martin on 2026-11-08.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<GetHomeInput> = {}): GetHomeInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    userId: CAMILLE,
    today: '2026-11-08',
    ...overrides,
  };
}

/**
 * Builds the lists of Atelier Nord: in "Produit", Sprint 12 (over), Sprint 13 (current, ends first),
 * Sprint 14 (current) and Bugs; in the private space "Design" of Hugo Dubois, a current sprint.
 *
 * @returns The fake spaces.
 */
function spaces(): InMemorySpaceDirectory {
  return new InMemorySpaceDirectory({
    lists: [
      placedList({
        id: SPRINT_12,
        name: 'Sprint 12',
        sprint: { startDate: '2026-10-20', endDate: '2026-11-01', goal: null },
        createdAt: new Date('2026-10-12T09:00:00Z'),
      }),
      placedList({
        id: SPRINT_13,
        name: 'Sprint 13',
        sprint: { startDate: '2026-11-04', endDate: '2026-11-10', goal: null },
        createdAt: new Date('2026-10-19T09:00:00Z'),
      }),
      placedList(),
      placedList({ id: BUGS, name: 'Bugs', sprint: null }),
      placedList({
        id: MAQUETTES,
        spaceId: DESIGN,
        name: 'Maquettes',
        sprint: { startDate: '2026-11-01', endDate: '2026-11-30', goal: null },
      }),
    ],
  });
}

/**
 * Builds the store of the tasks of Camille Martin on 2026-11-08.
 *
 * - Open: CAD-482 due 2026-11-12, the subtask CAD-483 due today, CAD-801 late, and CAD-805 to
 *   CAD-810 without a due date: nine tasks.
 * - Closed: CAD-802 done and CAD-803 cancelled.
 * - Left out: CAD-804 of the private space "Design" of Hugo Dubois, late.
 *
 * @returns The fake unit of work.
 */
function atelierNord(): InMemoryTasks {
  return new InMemoryTasks({
    tasks: [
      taskState({ assigneeIds: [CAMILLE, INES] }),
      subtaskState({ assigneeIds: [CAMILLE], dueDate: '2026-11-08' }),
      queryTask(1, { assigneeIds: [CAMILLE], dueDate: '2026-11-07' }),
      queryTask(2, {
        assigneeIds: [CAMILLE],
        status: 'done',
        completedAt: new Date('2026-11-03T10:00:00Z'),
      }),
      queryTask(3, { assigneeIds: [CAMILLE], status: 'cancelled', cancelReason: 'wontdo' }),
      queryTask(4, {
        assigneeIds: [CAMILLE],
        listId: MAQUETTES,
        spaceId: DESIGN,
        dueDate: '2026-10-01',
      }),
      ...[5, 6, 7, 8, 9, 10].map((index: number) => queryTask(index, { assigneeIds: [CAMILLE] })),
    ],
  });
}

describe('GetHome: the task part of "Accueil"', () => {
  const over = (tasks: InMemoryTasks, directory = spaces()): GetHome =>
    new GetHome(tasks, atelierNordMembers(), directory);

  it('counts the tasks assigned to the actor, subtasks included', async () => {
    const home = await over(atelierNord()).execute(read());

    expect(home.stats).toEqual({ assigned: 9, late: 1, dueToday: 1, done: 1 });
  });

  it('leaves out the tasks of a private space of another member', async () => {
    const home = await over(atelierNord()).execute(read());

    expect(home.stats.late).toBe(1);
    expect(home.priorities.map((task) => task.key)).not.toContain('CAD-804');
  });

  it('gives seven tasks that are not closed, by due date, the undated last, then in the order of creation', async () => {
    const home = await over(atelierNord()).execute(read());

    expect(home.priorities.map((task) => task.key)).toEqual([
      'CAD-801',
      'CAD-483',
      'CAD-482',
      'CAD-805',
      'CAD-806',
      'CAD-807',
      'CAD-808',
    ]);
  });

  it('asks for seven priorities, ten sprints and six lists', async () => {
    const tasks = atelierNord();
    const directory = spaces();

    await over(tasks, directory).execute(read());

    expect(tasks.reads.assigned).toEqual([{ state: 'open', after: null, limit: 7 }]);
    expect(directory.sprintCalls).toEqual([{ today: '2026-11-08', limit: 10 }]);
    expect(directory.sidebarCalls).toEqual([{ limit: 6 }]);
  });

  it('gives the sprints current today, the one ending first first, with the counts of their top-level tasks', async () => {
    const home = await over(atelierNord()).execute(read());

    expect(home.sprints.map((summary) => summary.list.id)).toEqual([SPRINT_13, SPRINT_14]);
    expect(home.sprints[0]?.counts).toEqual({ total: 0, open: 0, done: 0, cancelled: 0, late: 0 });
    expect(home.sprints[1]?.counts).toEqual({ total: 10, open: 8, done: 1, cancelled: 1, late: 1 });
  });

  it('counts the top-level tasks of the lists, as everywhere else, though the stats count the subtasks', async () => {
    const home = await over(atelierNord()).execute(read());
    const sprint14 = home.lists.find((summary) => summary.list.id === SPRINT_14);

    expect(sprint14?.counts.open).toBe(8);
    expect(home.stats.assigned).toBe(9);
  });

  it('gives the first lists in the order of the sidebar, the sprints included', async () => {
    const home = await over(atelierNord()).execute(read());

    expect(home.lists.map((summary) => summary.list.id)).toEqual([
      SPRINT_12,
      SPRINT_13,
      SPRINT_14,
      BUGS,
    ]);
  });

  it('reads the counts of the sprints and of the lists in one statement, each list once', async () => {
    const tasks = atelierNord();

    await over(tasks).execute(read());

    expect(tasks.reads.counts).toEqual([[SPRINT_13, SPRINT_14, SPRINT_12, BUGS]]);
  });
});

describe('GetHome: only the actor, and only what the actor sees', () => {
  it('refuses another userId as user-not-found, before reading the copy of the memberships and without a transaction', async () => {
    const members = atelierNordMembers();
    const tasks = atelierNord();
    const useCase = new GetHome(tasks, members, spaces());

    expect(await refusalOf(useCase.execute(read({ userId: INES })))).toEqual({
      reason: 'user-not-found',
    });
    expect(members.roleCalls).toEqual([]);
    expect(tasks.runs).toBe(0);
  });

  it('refuses the actor the copy does not hold as organization-not-found', async () => {
    const useCase = new GetHome(atelierNord(), atelierNordMembers(), spaces());

    expect(
      await refusalOf(useCase.execute(read({ actorUserId: STRANGER, userId: STRANGER }))),
    ).toEqual({ reason: 'organization-not-found' });
  });

  it('answers zeros and empty lists to a guest, without reading a task or a list', async () => {
    const tasks = atelierNord();
    const directory = spaces();
    const useCase = new GetHome(tasks, atelierNordMembers(), directory);

    const home = await useCase.execute(read({ actorUserId: NADIA, userId: NADIA }));

    expect(home).toEqual({
      stats: { assigned: 0, late: 0, dueToday: 0, done: 0 },
      priorities: [],
      sprints: [],
      lists: [],
    });
    expect(tasks.trace).not.toContain('counter.homeStatsOf');
    expect(directory.sprintCalls).toEqual([]);
    expect(directory.sidebarCalls).toEqual([]);
  });
});

describe('GetHome: the read runs in one read-only transaction on one snapshot', () => {
  it('opens a single read-only run with a snapshot', async () => {
    const tasks = atelierNord();

    await new GetHome(tasks, atelierNordMembers(), spaces()).execute(read());

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(1);
  });
});
