import { describe, expect, it } from 'vitest';

import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_483,
  CAD_490,
  CAMILLE,
  CLOTURES,
  DESIGN,
  HUGO_ACTOR,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  MAQUETTES,
  NADIA,
  NOW,
  STRANGER,
  archiveFrom,
  atelierNordMembers,
  cad490State,
  placedList,
  queryTask,
  refusalOf,
  sprint14SharedWith,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { ListArchivedTasksInput } from './list-archived-tasks.input.js';
import { ListArchivedTasks } from './list-archived-tasks.use-case.js';

/** When CAD-490 was archived, after CAD-482. */
const LATER: Date = new Date('2026-11-06T08:00:00.000Z');

/**
 * The archives of Atelier Nord: CAD-482 with its subtask CAD-483 in Sprint 14, archived on
 * 2026-11-05; CAD-490 alone in Bugs, archived the day after; DES-1 in the private space of Hugo
 * Dubois; CAD-801 in the archived list "Clôturés"; and a live task.
 */
function archives(): TaskState[] {
  return [
    taskState({ archive: archiveFrom(CAD_482), version: 13 }),
    subtaskState({ archive: archiveFrom(CAD_482), version: 2 }),
    cad490State({ listId: BUGS, archive: archiveFrom(CAD_490, { at: LATER }), version: 2 }),
    queryTask(2, {
      key: TaskKey.of('DES', 1),
      listId: MAQUETTES,
      spaceId: DESIGN,
      archive: archiveFrom(queryTask(2).id),
      version: 2,
    }),
    queryTask(1, {
      listId: CLOTURES,
      archive: archiveFrom(queryTask(1).id, { at: new Date('2026-11-04T08:00:00.000Z') }),
      version: 2,
    }),
    queryTask(3),
  ];
}

/**
 * Builds the read of a page by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<ListArchivedTasksInput> = {}): ListArchivedTasksInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    after: null,
    limit: 50,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord, the list "Clôturés" archived.
 *
 * @param spaces - The fake spaces, the usual ones with "Clôturés" archived when left out.
 * @returns The fake store and the use case.
 */
function atelierNord(spaces?: InMemorySpaceDirectory): {
  readonly tasks: InMemoryTasks;
  readonly useCase: ListArchivedTasks;
} {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: archives(), trace });
  const usual = new InMemorySpaceDirectory({
    lists: [
      placedList(),
      placedList({ id: BUGS, name: 'Bugs', sprint: null }),
      placedList({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes', sprint: null }),
      placedList({
        id: CLOTURES,
        spaceId: '019a7000-0000-7000-8000-000000000003',
        name: 'Clôturés',
        sprint: null,
        archivedAt: NOW,
        archivedBy: HUGO_ACTOR,
      }),
    ],
    trace,
  });
  return {
    tasks,
    useCase: new ListArchivedTasks(tasks, atelierNordMembers([], trace), spaces ?? usual),
  };
}

describe('ListArchivedTasks: the roots of the archives the actor sees, the latest first', () => {
  it('lists the roots of the lists the actor has a role on, archived lists included', async () => {
    const { useCase } = atelierNord();

    const page = await useCase.execute(read());

    expect(page.items.map((item) => item.task.key)).toEqual(['CAD-490', 'CAD-482', 'CAD-801']);
    expect(page.total).toBe(3);
    expect(page.next).toBeNull();
  });

  it('gives each root its list as it is now, its subtasks archived with it and the archive', async () => {
    const { useCase } = atelierNord();

    const [cad490, cad482, cad801] = (await useCase.execute(read())).items;

    expect(cad482).toMatchObject({
      task: { key: 'CAD-482', subtaskCounts: { total: 1, closed: 0 } },
      list: { id: taskState().listId, name: 'Sprint 14', state: 'active' },
      subtaskCount: 1,
      archivedAt: ARCHIVED_AT,
      archivedBy: HUGO_ACTOR,
    });
    expect(cad490).toMatchObject({ list: { id: BUGS, state: 'active' }, subtaskCount: 0 });
    expect(cad801).toMatchObject({ list: { id: CLOTURES, state: 'archived' } });
  });

  it('pages after the archive instant and the id of the last root, the total on every page', async () => {
    const { useCase } = atelierNord();

    const first = await useCase.execute(read({ limit: 1 }));
    const second = await useCase.execute(read({ limit: 1, after: first.next }));

    expect(first.items.map((item) => item.task.key)).toEqual(['CAD-490']);
    expect(first.next).toEqual({ archivedAt: LATER, id: CAD_490 });
    expect(second.items.map((item) => item.task.key)).toEqual(['CAD-482']);
    expect(second.total).toBe(3);
  });

  it('leaves the archives of a list closed to the actor out of the page and the total', async () => {
    const { useCase } = atelierNord(sprint14SharedWith({}));

    const page = await useCase.execute(read({ actorUserId: LEA }));

    expect(page.items.map((item) => item.task.key)).toEqual(['CAD-490', 'CAD-801']);
    expect(page.total).toBe(2);
  });

  it('answers an empty page without a read of the tasks for an actor with a role on no list', async () => {
    const { tasks, useCase } = atelierNord();

    const page = await useCase.execute(read({ actorUserId: NADIA }));

    expect(page).toEqual({ items: [], next: null, total: 0 });
    expect(tasks.trace.some((call: string): boolean => call.startsWith('archives.'))).toBe(false);
  });

  it('reads in one read-only snapshot', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(read());

    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(1);
  });

  it('refuses an actor the copy does not hold', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('ListArchivedTasks: a root whose live parent moved to another list reads as detached', () => {
  it('gives the summary of the root no parent key, and keeps the parent of a root in its list', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState({ listId: BUGS }),
        subtaskState({ archive: archiveFrom(CAD_483), version: 2 }),
        cad490State(),
        queryTask(4, {
          parentId: CAD_490,
          parentKey: TaskKey.of('CAD', 490),
          archive: archiveFrom(queryTask(4).id, { at: LATER }),
          version: 2,
        }),
      ],
    });

    const page = await new ListArchivedTasks(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    ).execute(read());

    expect(page.items.map((item) => [item.task.key, item.task.parentKey])).toEqual([
      ['CAD-804', 'CAD-490'],
      ['CAD-483', null],
    ]);
    expect(tasks.stored(CAD_483).parentId).toBe(CAD_482);
  });
});
