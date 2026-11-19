import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_490,
  InMemoryTasks,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  cad490State,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { FindTaskReferences } from './find-task-references.use-case.js';

/** A task id no task has. */
const UNKNOWN_TASK = '019a7200-0000-7000-8000-0000000009ff';

/**
 * Builds a store holding CAD-482 in Sprint 14 and CAD-490 in Bugs.
 *
 * @returns The fake store.
 */
function atelierNord(): InMemoryTasks {
  return new InMemoryTasks({ tasks: [taskState(), cad490State({ listId: BUGS })] });
}

describe('FindTaskReferences: tasks by their ids, whoever looks', () => {
  it('answers each task found with its key, name, status, list and space, unknown ids left out', async () => {
    const { tasks } = await new FindTaskReferences(atelierNord()).execute({
      organizationId: ATELIER_NORD,
      taskIds: [CAD_490, UNKNOWN_TASK, CAD_482],
    });

    expect([...tasks].sort((left, right) => left.key.localeCompare(right.key))).toEqual([
      {
        id: CAD_482,
        key: 'CAD-482',
        name: 'Refondre l’écran de connexion SSO',
        status: 'progress',
        listId: SPRINT_14,
        spaceId: PRODUIT,
      },
      {
        id: CAD_490,
        key: 'CAD-490',
        name: 'Page des quotas d’organisation',
        status: 'todo',
        listId: BUGS,
        spaceId: PRODUIT,
      },
    ]);
  });

  it('finds nothing in another organization', async () => {
    expect(
      await new FindTaskReferences(atelierNord()).execute({
        organizationId: OTHER_ORGANIZATION,
        taskIds: [CAD_482],
      }),
    ).toEqual({ tasks: [] });
  });

  it('leaves out an id that is not a UUID instead of failing the read', async () => {
    const store = atelierNord();

    const { tasks } = await new FindTaskReferences(store).execute({
      organizationId: ATELIER_NORD,
      taskIds: ['CAD-482', CAD_490],
    });

    expect(tasks.map((task) => task.key)).toEqual(['CAD-490']);
    expect(store.runs).toBe(1);
  });

  it('reads nothing, without a transaction, for no id', async () => {
    const store = atelierNord();

    expect(
      await new FindTaskReferences(store).execute({ organizationId: ATELIER_NORD, taskIds: [] }),
    ).toEqual({ tasks: [] });
    expect(store.runs).toBe(0);
  });
});

describe('FindTaskReferences: one statement for at most 100 ids', () => {
  it('reads 100 ids in one run that joins the transaction of the caller and writes nothing', async () => {
    const store = atelierNord();
    const ids: string[] = Array.from(
      { length: 99 },
      (_unused: unknown, index: number) =>
        `019a7200-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
    );

    await new FindTaskReferences(store).execute({
      organizationId: ATELIER_NORD,
      taskIds: [...ids, CAD_482],
    });

    expect(store.runs).toBe(1);
    expect(store.readOnlyRuns).toBe(0);
    expect(store.trace).toEqual(['reader.locationsByIds']);
    expect(store.events).toEqual([]);
  });

  it('refuses more than 100 ids as a defect of the caller, before any read', async () => {
    const store = atelierNord();
    const ids: string[] = Array.from({ length: 101 }, () => CAD_482);

    await expect(
      new FindTaskReferences(store).execute({ organizationId: ATELIER_NORD, taskIds: ids }),
    ).rejects.toThrow('At most 100 tasks');
    expect(store.runs).toBe(0);
  });
});

describe('FindTaskReferences: the tasks in the trash are left out', () => {
  it('leaves out a task in the trash, as an unknown one', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState({ trash: trashIn(), version: 13 }), cad490State({ listId: BUGS })],
    });

    const { tasks: found } = await new FindTaskReferences(tasks).execute({
      organizationId: ATELIER_NORD,
      taskIds: [CAD_482, CAD_490],
    });

    expect(found.map((task) => task.key)).toEqual(['CAD-490']);
  });
});
