import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAMILLE,
  CLOTURES,
  DESIGN,
  HUGO,
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
  archiveFrom,
} from '../../../tasks.fixture.js';
import type { ListLabelsInput } from './list-labels.input.js';
import { ListLabels } from './list-labels.use-case.js';

/**
 * Builds the reading of the first page of the labels by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<ListLabelsInput> = {}): ListLabelsInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    search: null,
    after: null,
    limit: 10,
    ...overrides,
  };
}

/**
 * Builds the store: CAD-482 (Auth, Front), its subtask (Zèbre), a task of Bugs (auth, API), and a
 * task of the private space "Design" of Hugo Dubois (Auth, Maquette, Secret).
 *
 * @returns The fake unit of work.
 */
function atelierNord(): InMemoryTasks {
  return new InMemoryTasks({
    tasks: [
      taskState({ labels: ['Auth', 'Front'] }),
      subtaskState({ labels: ['Zèbre'] }),
      queryTask(1, { listId: BUGS, labels: ['auth', 'API'] }),
      queryTask(2, {
        listId: MAQUETTES,
        spaceId: DESIGN,
        labels: ['Auth', 'Maquette', 'Secret'],
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
function over(tasks: InMemoryTasks): ListLabels {
  return new ListLabels(tasks, atelierNordMembers(), new InMemorySpaceDirectory());
}

describe('ListLabels: the labels of the tasks the actor sees, each once', () => {
  it('lists each label once whatever its case, subtasks included, in the order of its folded name', async () => {
    const page = await over(atelierNord()).execute(read());

    expect(page.items.map((item) => item.name)).toEqual(['API', 'Auth', 'Front', 'Zèbre']);
    expect(page.next).toBeNull();
  });

  it('shows the spelling that comes first among those of the tasks the actor sees', async () => {
    const page = await over(atelierNord()).execute(read());

    expect(page.items.find((item) => item.name.toLowerCase() === 'auth')?.name).toBe('Auth');
  });

  it('leaves out the labels of a private space of another member', async () => {
    const page = await over(atelierNord()).execute(read());

    expect(page.items.map((item) => item.name)).not.toContain('Secret');
    expect(page.items.map((item) => item.name)).not.toContain('Maquette');
  });

  it('shows them to the owner of that private space', async () => {
    const page = await over(atelierNord()).execute(read({ actorUserId: HUGO }));

    expect(page.items.map((item) => item.name)).toContain('Secret');
  });

  it('hands the lists the actor has a role on and the search to the reader', async () => {
    const tasks = atelierNord();

    await over(tasks).execute(read({ search: 'AU' }));

    expect(tasks.reads.labels).toHaveLength(1);
    expect(tasks.reads.labels[0]?.search).toBe('AU');
    expect(tasks.reads.labels[0]?.listIds).toEqual([SPRINT_14, BUGS, CLOTURES]);
  });

  it('keeps the labels that contain the search, without regard to case or accents', async () => {
    const page = await over(atelierNord()).execute(read({ search: 'ZEB' }));

    expect(page.items.map((item) => item.name)).toEqual(['Zèbre']);
  });

  it('walks the pages from the position of the last label', async () => {
    const useCase = over(atelierNord());

    const first = await useCase.execute(read({ limit: 3 }));
    const second = await useCase.execute(read({ limit: 3, after: first.next }));

    expect(first.items.map((item) => item.name)).toEqual(['API', 'Auth', 'Front']);
    expect(first.next).toEqual({ sortKey: 'front', labelKey: 'front' });
    expect(second.items.map((item) => item.name)).toEqual(['Zèbre']);
    expect(second.next).toBeNull();
  });

  it('reads one row more than the page to know whether another follows', async () => {
    const tasks = atelierNord();

    await over(tasks).execute(read({ limit: 3 }));

    expect(tasks.reads.labels[0]?.limit).toBe(4);
  });

  it('answers an empty page for a task without a label', async () => {
    const page = await over(new InMemoryTasks({ tasks: [queryTask(1)] })).execute(read());

    expect(page).toEqual({ items: [], next: null });
  });
});

describe('ListLabels: the lists of a guest are those shared with them', () => {
  it('answers an empty page without reading any label to a guest with no list grant', async () => {
    const tasks = atelierNord();

    const page = await over(tasks).execute(read({ actorUserId: NADIA }));

    expect(page).toEqual({ items: [], next: null });
    expect(tasks.reads.labels).toEqual([]);
  });

  it('shows a guest the labels of the tasks of a list shared with them, and of no other', async () => {
    const tasks = atelierNord();
    const spaces = new InMemorySpaceDirectory({ listGrants: { [BUGS]: { [NADIA]: 'view' } } });

    const page = await new ListLabels(tasks, atelierNordMembers(), spaces).execute(
      read({ actorUserId: NADIA }),
    );

    expect(page.items.map((item) => item.name)).toEqual(['API', 'auth']);
    expect(tasks.reads.labels[0]?.listIds).toEqual([BUGS]);
  });

  it('leaves out a list of a space of the organization whose switch is off', async () => {
    const tasks = atelierNord();
    const spaces = new InMemorySpaceDirectory({
      lists: [placedList({ organizationAccess: false }), placedList({ id: BUGS, sprint: null })],
    });

    const page = await new ListLabels(tasks, atelierNordMembers(), spaces).execute(
      read({ actorUserId: HUGO }),
    );

    expect(page.items.map((item) => item.name)).toEqual(['API', 'auth']);
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    expect(await refusalOf(over(atelierNord()).execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('ListLabels: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = atelierNord();

    await over(tasks).execute(read());

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
  });
});

describe('ListLabels: the labels of an archived task are left out', () => {
  it('lists the labels of the live tasks only', async () => {
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
      ],
    });
    const useCase = new ListLabels(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    const page = await useCase.execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      search: null,
      after: null,
      limit: 50,
    });

    expect(page.items.map((label) => label.name)).toEqual(['Auth', 'Front']);
  });
});
