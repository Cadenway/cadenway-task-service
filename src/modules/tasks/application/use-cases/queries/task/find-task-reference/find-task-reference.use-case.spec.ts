import { describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import {
  ATELIER_NORD,
  CAD_482,
  DESIGN,
  InMemoryTasks,
  MAQUETTES,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { FindTaskReference } from './find-task-reference.use-case.js';

/** The task DES-1 of the private space "Design" of Hugo Dubois. */
const DES_1 = '019a7200-0000-7000-8000-000000000601';

/**
 * Builds a store holding CAD-482 and DES-1.
 *
 * @returns The fake store.
 */
function atelierNord(): InMemoryTasks {
  return new InMemoryTasks({
    tasks: [
      taskState(),
      taskState({
        id: DES_1,
        key: TaskKey.of('DES', 1),
        name: 'Icônes',
        status: 'todo',
        listId: MAQUETTES,
        spaceId: DESIGN,
      }),
    ],
  });
}

describe('FindTaskReference: a task by its key, whoever looks', () => {
  it('answers the id, the key, the name, the status, the list and the space as they are now', async () => {
    const reference = await new FindTaskReference(atelierNord()).execute({
      organizationId: ATELIER_NORD,
      taskKey: 'CAD-482',
    });

    expect(reference).toEqual({
      id: CAD_482,
      key: 'CAD-482',
      name: 'Refondre l’écran de connexion SSO',
      status: 'progress',
      listId: SPRINT_14,
      spaceId: PRODUIT,
    });
  });

  it('checks no visibility: a task of a private space is found too', async () => {
    const reference = await new FindTaskReference(atelierNord()).execute({
      organizationId: ATELIER_NORD,
      taskKey: 'DES-1',
    });

    expect(reference).toMatchObject({ id: DES_1, listId: MAQUETTES, spaceId: DESIGN });
  });

  it.each([
    ['an unknown key', ATELIER_NORD, 'CAD-999'],
    ['a key of another organization', OTHER_ORGANIZATION, 'CAD-482'],
  ])('answers null for %s', async (_name, organizationId, taskKey) => {
    expect(
      await new FindTaskReference(atelierNord()).execute({ organizationId, taskKey }),
    ).toBeNull();
  });

  it.each(['cad-482', 'CAD-0482', 'CAD', ''])(
    'answers null for the malformed key %j, without a transaction',
    async (taskKey) => {
      const tasks = atelierNord();

      expect(
        await new FindTaskReference(tasks).execute({ organizationId: ATELIER_NORD, taskKey }),
      ).toBeNull();
      expect(tasks.runs).toBe(0);
    },
  );
});

describe('FindTaskReference: one read in the transaction of the caller', () => {
  it('runs once, joining the transaction, reads the task without its collections and writes nothing', async () => {
    const tasks = atelierNord();

    await new FindTaskReference(tasks).execute({
      organizationId: ATELIER_NORD,
      taskKey: 'CAD-482',
    });

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(0);
    expect(tasks.trace).toEqual(['reader.locationByKey']);
    expect(tasks.events).toEqual([]);
  });
});

describe('FindTaskReference: a task in the trash is not found', () => {
  it('answers null for a task in the trash, so its requests are hidden at once', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ trash: trashIn(), version: 13 })] });

    expect(
      await new FindTaskReference(tasks).execute({
        organizationId: ATELIER_NORD,
        taskKey: 'CAD-482',
      }),
    ).toBeNull();
  });
});
