import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  NADIA,
  STRANGER,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  taskState,
} from '../../../tasks.fixture.js';
import type { UnassignTaskInput } from './unassign-task.input.js';
import { UnassignTask } from './unassign-task.use-case.js';

/**
 * Builds the removal of an account from CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function unassign(overrides: Partial<UnassignTaskInput> = {}): UnassignTaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    userId: INES,
    expectedVersions: null,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord holding CAD-482.
 *
 * @param removed - The accounts the copy of the members no longer holds.
 * @returns The fake store and the use case.
 */
function atelierNord(removed: readonly string[] = []): {
  readonly tasks: InMemoryTasks;
  readonly useCase: UnassignTask;
} {
  const tasks = new InMemoryTasks({ tasks: [taskState()] });
  return {
    tasks,
    useCase: new UnassignTask(tasks, atelierNordMembers(removed), new InMemorySpaceDirectory()),
  };
}

describe('UnassignTask: an assignee is removed', () => {
  it('removes the account and answers the version after the change', async () => {
    const { tasks, useCase } = atelierNord();

    const output = await useCase.execute(unassign());

    expect(output).toEqual({ version: 13 });
    expect(tasks.stored(CAD_482).assigneeIds).toEqual([CAMILLE]);
  });

  it('records an assign entry with added false and appends task.updated.v1 only', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(unassign());

    const actor = { type: 'user', id: CAMILLE };
    expect(tasks.entriesOf(CAD_482)).toEqual([
      expect.objectContaining({
        change: { kind: 'assign', assignee: { userId: INES, added: false } },
        actor,
      }),
    ]);
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-482', version: 13, changed: ['assigneeIds'], actor },
    ]);
  });

  it('removes an account that is no longer a member of the organization', async () => {
    const { tasks, useCase } = atelierNord([INES]);

    await useCase.execute(unassign());

    expect(tasks.stored(CAD_482).assigneeIds).toEqual([CAMILLE]);
  });

  it('answers the current version, with no entry and no event, for an account not assigned', async () => {
    const { tasks, useCase } = atelierNord();

    expect(await useCase.execute(unassign({ userId: HUGO }))).toEqual({ version: 12 });
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });
});

describe('UnassignTask: the refusals', () => {
  it('refuses another version with the stored one', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(unassign({ expectedVersions: [2] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
  });

  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['a task of no list shared with a guest', { actorUserId: NADIA }],
  ] as const)('refuses %s as task-not-found', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(unassign(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses an account the copy does not hold as the actor with organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(unassign({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('UnassignTask: a change needs edit on the list of the task', () => {
  it.each(['view', 'comment'] as const)(
    'refuses a member with %s on Sprint 14 as role-insufficient, changing nothing',
    async (role) => {
      const tasks = InMemoryTasks.withCad482();
      const useCase = new UnassignTask(
        tasks,
        atelierNordMembers(),
        sprint14SharedWith({ [HUGO]: role }),
      );

      expect(await refusalOf(useCase.execute(unassign({ actorUserId: HUGO })))).toEqual({
        reason: 'role-insufficient',
        role,
      });
      expect(tasks.stored(CAD_482).assigneeIds).toEqual([CAMILLE, INES]);
      expect(tasks.events).toEqual([]);
    },
  );

  it('answers role-insufficient before version-mismatch', async () => {
    const useCase = new UnassignTask(
      InMemoryTasks.withCad482(),
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'comment' }),
    );

    expect(
      await refusalOf(useCase.execute(unassign({ actorUserId: HUGO, expectedVersions: [3] }))),
    ).toEqual({ reason: 'role-insufficient', role: 'comment' });
  });
});
