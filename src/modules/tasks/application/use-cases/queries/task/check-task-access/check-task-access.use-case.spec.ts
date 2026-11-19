import { describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import {
  ATELIER_NORD,
  BUGS,
  CAMILLE,
  DESIGN,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  MAQUETTES,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  taskState,
} from '../../../tasks.fixture.js';
import type { CheckTaskAccessInput } from './check-task-access.input.js';
import { CheckTaskAccess } from './check-task-access.use-case.js';

/**
 * Builds the check of CAD-482 for a socket of Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function check(overrides: Partial<CheckTaskAccessInput> = {}): CheckTaskAccessInput {
  return { organizationId: ATELIER_NORD, actorUserId: CAMILLE, taskKey: 'CAD-482', ...overrides };
}

/**
 * Builds the use case over CAD-482 in Sprint 14 and a task of the private space "Design".
 *
 * @param spaces - The fake spaces.
 * @returns The fake store and the use case.
 */
function atelierNord(spaces: InMemorySpaceDirectory = new InMemorySpaceDirectory()): {
  readonly tasks: InMemoryTasks;
  readonly useCase: CheckTaskAccess;
} {
  const tasks = new InMemoryTasks({
    tasks: [
      taskState(),
      taskState({
        id: '019a7200-0000-7000-8000-000000000601',
        key: TaskKey.of('DES', 1),
        listId: MAQUETTES,
        spaceId: DESIGN,
      }),
    ],
  });
  return { tasks, useCase: new CheckTaskAccess(tasks, atelierNordMembers(), spaces) };
}

describe('CheckTaskAccess: the role of the actor on the list of the task', () => {
  it('answers edit, the space, the list and the key to a member of a list of the organization', async () => {
    const { useCase } = atelierNord();

    expect(await useCase.execute(check({ actorUserId: HUGO }))).toEqual({
      role: 'edit',
      spaceId: PRODUIT,
      listId: SPRINT_14,
      taskKey: 'CAD-482',
    });
  });

  it.each(['view', 'comment'] as const)(
    'answers %s to a member the list is shared with that role',
    async (role) => {
      const { useCase } = atelierNord(sprint14SharedWith({ [HUGO]: role }));

      expect((await useCase.execute(check({ actorUserId: HUGO }))).role).toBe(role);
    },
  );

  it('answers edit to the owner of a private space for a task of it', async () => {
    const { useCase } = atelierNord();

    expect(await useCase.execute(check({ actorUserId: HUGO, taskKey: 'DES-1' }))).toEqual({
      role: 'edit',
      spaceId: DESIGN,
      listId: MAQUETTES,
      taskKey: 'DES-1',
    });
  });

  it('answers the role of a guest the list is shared with', async () => {
    const { useCase } = atelierNord(sprint14SharedWith({ [NADIA]: 'comment' }));

    expect((await useCase.execute(check({ actorUserId: NADIA }))).role).toBe('comment');
  });

  it('follows the task to the list it is in now', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ listId: BUGS })] });
    const useCase = new CheckTaskAccess(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    expect(await useCase.execute(check())).toMatchObject({ listId: BUGS, spaceId: PRODUIT });
  });
});

describe('CheckTaskAccess: what the actor does not see is not found', () => {
  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['a key that is not a key', { taskKey: 'cad-482' }],
    ['a task of no list shared with a guest', { actorUserId: NADIA }],
    ['a task of the private space of another member', { taskKey: 'DES-1' }],
  ] as const)('answers %s as task-not-found', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(check(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('answers a task of a list closed to the member as task-not-found', async () => {
    const { useCase } = atelierNord(sprint14SharedWith({ [HUGO]: 'view' }));

    expect(await refusalOf(useCase.execute(check({ actorUserId: INES })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it.each([
    ['an account the copy does not hold', { actorUserId: STRANGER }],
    ['another organization', { organizationId: OTHER_ORGANIZATION }],
  ] as const)('answers %s as organization-not-found', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(check(overrides)))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('CheckTaskAccess: one read-only run that writes nothing', () => {
  it('opens a single read-only run, reads the task without its collections and emits nothing', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(check());

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
    expect(tasks.trace).toContain('reader.locationByKey');
    expect(tasks.trace.filter((call) => call.startsWith('tasks.'))).toEqual([]);
    expect(tasks.events).toEqual([]);
  });
});
