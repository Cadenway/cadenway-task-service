import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  STRANGER,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  taskState,
} from '../../../tasks.fixture.js';
import type { AddTaskLabelInput } from './add-task-label.input.js';
import { AddTaskLabel } from './add-task-label.use-case.js';

/**
 * Builds the addition of a label to CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function addLabel(overrides: Partial<AddTaskLabelInput> = {}): AddTaskLabelInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    name: ' Urgent ',
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
  readonly useCase: AddTaskLabel;
} {
  const tasks = new InMemoryTasks({ tasks: stored });
  return {
    tasks,
    useCase: new AddTaskLabel(tasks, atelierNordMembers(), new InMemorySpaceDirectory()),
  };
}

describe('AddTaskLabel: a label is added to the end of the labels', () => {
  it('adds the trimmed label, takes the next version and appends task.updated.v1', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(addLabel());

    expect(view).toMatchObject({ labels: ['Auth', 'Front', 'Urgent'], version: 13 });
    expect(tasks.events).toEqual([
      {
        kind: 'updated',
        key: 'CAD-482',
        version: 13,
        changed: ['labels'],
        actor: { type: 'user', id: CAMILLE },
      },
    ]);
  });

  it('records nothing in the activity', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(addLabel());

    expect(tasks.activity.size).toBe(0);
  });

  it('changes nothing for a label the task has, ignoring case', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(addLabel({ name: 'auth' }));

    expect(view).toMatchObject({ labels: ['Auth', 'Front'], version: 12 });
    expect(tasks.events).toEqual([]);
  });
});

describe('AddTaskLabel: the refusals', () => {
  it('refuses the 21st label with label-limit-reached', async () => {
    const twenty = Array.from({ length: 20 }, (_, index) => `Étiquette ${String(index)}`);
    const { tasks, useCase } = atelierNord([taskState({ labels: twenty })]);

    expect(await refusalOf(useCase.execute(addLabel()))).toEqual({
      reason: 'label-limit-reached',
    });
    expect(tasks.stored(CAD_482).labels).toEqual(twenty);
  });

  it('refuses another version with the stored one', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(addLabel({ expectedVersions: [1] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
  });

  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['a task of no list shared with a guest', { actorUserId: NADIA }],
  ] as const)('refuses %s as task-not-found', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(addLabel(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses an account the copy does not hold with organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(addLabel({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('AddTaskLabel: a change needs edit on the list of the task', () => {
  it.each(['view', 'comment'] as const)(
    'refuses a member with %s on Sprint 14 as role-insufficient, changing nothing',
    async (role) => {
      const tasks = InMemoryTasks.withCad482();
      const useCase = new AddTaskLabel(
        tasks,
        atelierNordMembers(),
        sprint14SharedWith({ [HUGO]: role }),
      );

      expect(await refusalOf(useCase.execute(addLabel({ actorUserId: HUGO })))).toEqual({
        reason: 'role-insufficient',
        role,
      });
      expect(tasks.stored(CAD_482).labels).toEqual(['Auth', 'Front']);
      expect(tasks.events).toEqual([]);
    },
  );

  it('lets a guest with edit on the list add a label', async () => {
    const useCase = new AddTaskLabel(
      InMemoryTasks.withCad482(),
      atelierNordMembers(),
      sprint14SharedWith({ [NADIA]: 'edit' }),
    );

    const view = await useCase.execute(addLabel({ actorUserId: NADIA }));

    expect(view.labels).toEqual(['Auth', 'Front', 'Urgent']);
  });
});
