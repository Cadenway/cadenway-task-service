import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  MAQUETTES,
  NADIA,
  STRANGER,
  atelierNordMembers,
  queryTask,
  refusalOf,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { ListMyTasksInput } from './list-my-tasks.input.js';
import { ListMyTasks } from './list-my-tasks.use-case.js';

/**
 * Builds the reading of the first page of the open tasks of Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<ListMyTasksInput> = {}): ListMyTasksInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    userId: CAMILLE,
    state: 'open',
    after: null,
    limit: 10,
    ...overrides,
  };
}

/**
 * Builds the store of the tasks assigned to Camille Martin, Inès Robert and Hugo Dubois.
 *
 * - Camille, open: CAD-801 due 2026-11-07, CAD-482 and CAD-806 due 2026-11-12, then the subtask
 *   CAD-483 without a due date.
 * - Camille, closed: CAD-802 done and CAD-803 cancelled.
 * - Left out for Camille: CAD-804 of Inès Robert, and CAD-805 of the private space "Design" of
 *   Hugo Dubois, which Camille is assigned to.
 *
 * @returns The fake unit of work.
 */
function atelierNord(): InMemoryTasks {
  const closedAt = new Date('2026-11-03T10:00:00Z');
  return new InMemoryTasks({
    tasks: [
      taskState({ assigneeIds: [CAMILLE, INES] }),
      subtaskState({ assigneeIds: [CAMILLE] }),
      queryTask(1, { assigneeIds: [CAMILLE], dueDate: '2026-11-07' }),
      queryTask(2, { assigneeIds: [CAMILLE], status: 'done', completedAt: closedAt }),
      queryTask(3, { assigneeIds: [CAMILLE], status: 'cancelled', cancelReason: 'wontdo' }),
      queryTask(4, { assigneeIds: [INES] }),
      queryTask(5, {
        assigneeIds: [CAMILLE, HUGO],
        listId: MAQUETTES,
        spaceId: DESIGN,
      }),
      queryTask(6, { assigneeIds: [CAMILLE], dueDate: '2026-11-12' }),
    ],
  });
}

describe('ListMyTasks: the tasks assigned to the actor, by due date, subtasks included', () => {
  const over = (tasks: InMemoryTasks): ListMyTasks =>
    new ListMyTasks(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

  it('reads the open tab by due date, the undated last, then in the order of creation', async () => {
    const page = await over(atelierNord()).execute(read());

    expect(page.items.map((item) => item.key)).toEqual([
      'CAD-801',
      'CAD-482',
      'CAD-806',
      'CAD-483',
    ]);
    expect(page.next).toBeNull();
  });

  it('includes the subtasks', async () => {
    const page = await over(atelierNord()).execute(read());

    expect(page.items.find((item) => item.key === 'CAD-483')?.parentKey).toBe('CAD-482');
  });

  it('reads the closed tab: the tasks done and cancelled', async () => {
    const page = await over(atelierNord()).execute(read({ state: 'closed' }));

    expect(page.items.map((item) => item.key)).toEqual(['CAD-802', 'CAD-803']);
  });

  it('counts both tabs on every page', async () => {
    const open = await over(atelierNord()).execute(read());
    const closed = await over(atelierNord()).execute(read({ state: 'closed', limit: 1 }));

    expect(open.counts).toEqual({ open: 4, closed: 2 });
    expect(closed.counts).toEqual({ open: 4, closed: 2 });
  });

  it('leaves out the tasks of others and those of a private space of another member', async () => {
    const page = await over(atelierNord()).execute(read({ limit: 100 }));

    expect(page.items.map((item) => item.key)).not.toContain('CAD-804');
    expect(page.items.map((item) => item.key)).not.toContain('CAD-805');
  });

  it('shows the task of the private space to its owner', async () => {
    const page = await over(atelierNord()).execute(
      read({ actorUserId: HUGO, userId: HUGO, limit: 100 }),
    );

    expect(page.items.map((item) => item.key)).toEqual(['CAD-805']);
  });

  it('walks the pages from the position of the last task, the counts the same on each', async () => {
    const useCase = over(atelierNord());

    const first = await useCase.execute(read({ limit: 2 }));
    const second = await useCase.execute(read({ limit: 2, after: first.next }));

    expect(first.items.map((item) => item.key)).toEqual(['CAD-801', 'CAD-482']);
    expect(first.next).toMatchObject({ sortValue: '2026-11-12', id: CAD_482 });
    expect(second.items.map((item) => item.key)).toEqual(['CAD-806', 'CAD-483']);
    expect(second.next).toBeNull();
    expect([first.counts, second.counts]).toEqual([
      { open: 4, closed: 2 },
      { open: 4, closed: 2 },
    ]);
  });

  it('reads one row more than the page to know whether another follows', async () => {
    const tasks = atelierNord();

    await over(tasks).execute(read({ limit: 2 }));

    expect(tasks.reads.assigned).toEqual([{ state: 'open', after: null, limit: 3 }]);
  });

  it('takes a userId in upper case for the actor', async () => {
    const page = await over(atelierNord()).execute(read({ userId: CAMILLE.toUpperCase() }));

    expect(page.items).toHaveLength(4);
  });

  it('answers an empty page for an actor without a task', async () => {
    const page = await over(new InMemoryTasks()).execute(read());

    expect(page).toEqual({ items: [], next: null, counts: { open: 0, closed: 0 } });
  });
});

describe('ListMyTasks: only the tasks of the actor', () => {
  it('refuses another userId as user-not-found, before reading the copy of the memberships', async () => {
    const members = atelierNordMembers();
    const useCase = new ListMyTasks(atelierNord(), members, new InMemorySpaceDirectory());

    expect(await refusalOf(useCase.execute(read({ userId: INES })))).toEqual({
      reason: 'user-not-found',
    });
    expect(members.roleCalls).toEqual([]);
  });

  it('refuses another userId as user-not-found even for an account the copy does not hold', async () => {
    const useCase = new ListMyTasks(
      atelierNord(),
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );

    expect(await refusalOf(useCase.execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'user-not-found',
    });
  });

  it('refuses the actor the copy does not hold as organization-not-found', async () => {
    const useCase = new ListMyTasks(
      atelierNord(),
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );

    expect(
      await refusalOf(useCase.execute(read({ actorUserId: STRANGER, userId: STRANGER }))),
    ).toEqual({ reason: 'organization-not-found' });
  });

  it('answers an empty page with zero counts to a guest, without reading a task', async () => {
    const tasks = atelierNord();
    const useCase = new ListMyTasks(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    const page = await useCase.execute(read({ actorUserId: NADIA, userId: NADIA }));

    expect(page).toEqual({ items: [], next: null, counts: { open: 0, closed: 0 } });
    expect(tasks.reads.assigned).toEqual([]);
    expect(tasks.trace).not.toContain('counter.stateCountsOf');
  });
});

describe('ListMyTasks: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = atelierNord();

    await new ListMyTasks(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute(
      read(),
    );

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
  });
});
