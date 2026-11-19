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
import type { AddChecklistItemInput } from './add-checklist-item.input.js';
import { AddChecklistItem } from './add-checklist-item.use-case.js';

/**
 * Builds the addition of an item to the checklist of CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function addItem(overrides: Partial<AddChecklistItemInput> = {}): AddChecklistItemInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    text: '  Revue de code  ',
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
  readonly useCase: AddChecklistItem;
} {
  const tasks = new InMemoryTasks({ tasks: stored });
  return {
    tasks,
    useCase: new AddChecklistItem(tasks, atelierNordMembers(), new InMemorySpaceDirectory()),
  };
}

describe('AddChecklistItem: an unticked item is added at the end of the checklist', () => {
  it('adds the trimmed item, answers its id and takes the next version', async () => {
    const { tasks, useCase } = atelierNord();

    const { task, checklistItemId } = await useCase.execute(addItem());

    expect(task.version).toBe(13);
    expect(task.checklist.map((item) => item.text)).toEqual([
      'Maquette validée',
      'Recette en préproduction',
      'Revue de code',
    ]);
    expect(task.checklist.at(-1)).toEqual({
      id: checklistItemId,
      text: 'Revue de code',
      done: false,
    });
    expect(task.checklistCounts).toEqual({ total: 3, done: 1 });
    expect(tasks.stored(CAD_482).checklist.at(-1)).toMatchObject({
      id: checklistItemId,
      position: 2,
    });
  });

  it('appends task.updated.v1 for the checklist and records nothing in the activity', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(addItem());

    expect(tasks.events).toEqual([
      {
        kind: 'updated',
        key: 'CAD-482',
        version: 13,
        changed: ['checklist'],
        actor: { type: 'user', id: CAMILLE },
      },
    ]);
    expect(tasks.activity.size).toBe(0);
  });
});

describe('AddChecklistItem: the refusals', () => {
  it('refuses the 101st item with checklist-limit-reached', async () => {
    const hundred = Array.from({ length: 100 }, (_, index) => ({
      id: `019a7300-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
      text: `Étape ${String(index)}`,
      done: false,
      position: index,
    }));
    const { tasks, useCase } = atelierNord([taskState({ checklist: hundred })]);

    expect(await refusalOf(useCase.execute(addItem()))).toEqual({
      reason: 'checklist-limit-reached',
    });
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['a task of no list shared with a guest', { actorUserId: NADIA }],
  ] as const)('refuses %s as task-not-found', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(addItem(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses an account the copy does not hold with organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(addItem({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('AddChecklistItem: a change needs edit on the list of the task', () => {
  it.each(['view', 'comment'] as const)(
    'refuses a member with %s on Sprint 14 as role-insufficient, adding nothing',
    async (role) => {
      const tasks = InMemoryTasks.withCad482();
      const useCase = new AddChecklistItem(
        tasks,
        atelierNordMembers(),
        sprint14SharedWith({ [HUGO]: role }),
      );

      expect(await refusalOf(useCase.execute(addItem({ actorUserId: HUGO })))).toEqual({
        reason: 'role-insufficient',
        role,
      });
      expect(tasks.stored(CAD_482).checklist).toHaveLength(2);
      expect(tasks.events).toEqual([]);
    },
  );
});
