import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  LEA,
  NADIA,
  NOW,
  STRANGER,
  atelierNordMembers,
  refusalOf,
  taskState,
} from '../../../tasks.fixture.js';
import type { AssignTaskInput } from './assign-task.input.js';
import { AssignTask } from './assign-task.use-case.js';

/**
 * Builds the assignment of an account to CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function assign(overrides: Partial<AssignTaskInput> = {}): AssignTaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    userId: HUGO,
    expectedVersions: null,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord holding the given tasks.
 *
 * @param stored - The tasks.
 * @returns The fake store and the use case.
 */
function atelierNord(stored = [taskState()]): {
  readonly tasks: InMemoryTasks;
  readonly useCase: AssignTask;
} {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: stored, trace });
  return {
    tasks,
    useCase: new AssignTask(
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    ),
  };
}

describe('AssignTask: a current member other than a guest is assigned', () => {
  it('appends the account to the assignees and takes the next version', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(assign());

    expect(view).toMatchObject({ assigneeIds: [CAMILLE, INES, HUGO], version: 13 });
    expect(tasks.stored(CAD_482)).toMatchObject({
      assigneeIds: [CAMILLE, INES, HUGO],
      updatedAt: NOW,
    });
  });

  it('records an assign entry and appends task.updated.v1 then task.assigned.v1', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(assign());

    const actor = { type: 'user', id: CAMILLE };
    expect(tasks.entriesOf(CAD_482)).toEqual([
      expect.objectContaining({
        change: { kind: 'assign', assignee: { userId: HUGO, added: true } },
        actor,
      }),
    ]);
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-482', version: 13, changed: ['assigneeIds'], actor },
      { kind: 'assigned', key: 'CAD-482', version: 13, assigneeId: HUGO, actor },
    ]);
  });

  it('locks the actor, then the new assignee, then the task', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(assign());

    expect(tasks.trace.slice(0, 3)).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      `members.roleOf:${HUGO}:lock`,
      'tasks.findByKey:lock',
    ]);
  });

  it('lets people assign themselves', async () => {
    const { useCase } = atelierNord();

    const view = await useCase.execute(assign({ actorUserId: LEA, userId: LEA }));

    expect(view.assigneeIds).toEqual([CAMILLE, INES, LEA]);
  });
});

describe('AssignTask: an account already assigned changes nothing', () => {
  it('answers the same version, with no entry and no event', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(assign({ userId: INES }));

    expect(view.version).toBe(12);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });

  it('keeps a guest who is already assigned, whatever their membership now says', async () => {
    const { useCase } = atelierNord([taskState({ assigneeIds: [NADIA] })]);

    expect((await useCase.execute(assign({ userId: NADIA }))).version).toBe(12);
  });

  it('checks If-Match before answering that nothing changed', async () => {
    const { useCase } = atelierNord();

    expect(
      await refusalOf(useCase.execute(assign({ userId: INES, expectedVersions: [3] }))),
    ).toEqual({ reason: 'version-mismatch', version: 12 });
  });
});

describe('AssignTask: the refusals', () => {
  it.each([
    ['a guest', NADIA],
    ['an account the copy does not hold', STRANGER],
  ])('refuses %s with assignee-invalid naming it', async (_name, userId) => {
    const { tasks, useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(assign({ userId })))).toEqual({
      reason: 'assignee-invalid',
      userIds: [userId],
    });
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it('refuses the 21st assignee with assignee-limit-reached', async () => {
    const twenty = Array.from(
      { length: 20 },
      (_, index) => `019a5f3c-8d2e-7c4a-9b1f-${String(index).padStart(12, '0')}`,
    );
    const { useCase } = atelierNord([taskState({ assigneeIds: twenty })]);

    expect(await refusalOf(useCase.execute(assign()))).toEqual({
      reason: 'assignee-limit-reached',
    });
  });

  it('refuses another version with the stored one', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(assign({ expectedVersions: [11] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
  });

  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['any task, for a guest', { actorUserId: NADIA }],
  ] as const)('refuses %s as task-not-found', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(assign(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses an account the copy does not hold as the actor with organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(assign({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});
