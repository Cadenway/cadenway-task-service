import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  taskState,
  archiveFrom,
} from '../../../tasks.fixture.js';
import type { RemoveTaskLabelInput } from './remove-task-label.input.js';
import { RemoveTaskLabel } from './remove-task-label.use-case.js';

/**
 * Builds the removal of a label from CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function removeLabel(overrides: Partial<RemoveTaskLabelInput> = {}): RemoveTaskLabelInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    name: 'front',
    expectedVersions: null,
    ...overrides,
  };
}

/** A use case on Atelier Nord holding CAD-482. */
function atelierNord(): { readonly tasks: InMemoryTasks; readonly useCase: RemoveTaskLabel } {
  const tasks = new InMemoryTasks({ tasks: [taskState()] });
  return {
    tasks,
    useCase: new RemoveTaskLabel(tasks, atelierNordMembers(), new InMemorySpaceDirectory()),
  };
}

describe('RemoveTaskLabel: a label is removed, ignoring case', () => {
  it('removes the label, takes the next version and appends task.updated.v1', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(removeLabel());

    expect(view).toMatchObject({ labels: ['Auth'], version: 13 });
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

  it('changes nothing for a label the task does not have', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(removeLabel({ name: 'Back' }));

    expect(view.version).toBe(12);
    expect(tasks.events).toEqual([]);
  });
});

describe('RemoveTaskLabel: the refusals', () => {
  it('refuses another version with the stored one', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(removeLabel({ expectedVersions: [9] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
  });

  it('refuses a guest as task-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(removeLabel({ actorUserId: NADIA })))).toEqual({
      reason: 'task-not-found',
    });
  });
});

describe('RemoveTaskLabel: a change needs edit on the list of the task', () => {
  it.each(['view', 'comment'] as const)(
    'refuses a member with %s on Sprint 14 as role-insufficient, changing nothing',
    async (role) => {
      const tasks = InMemoryTasks.withCad482();
      const useCase = new RemoveTaskLabel(
        tasks,
        atelierNordMembers(),
        sprint14SharedWith({ [HUGO]: role }),
      );

      expect(await refusalOf(useCase.execute(removeLabel({ actorUserId: HUGO })))).toEqual({
        reason: 'role-insufficient',
        role,
      });
      expect(tasks.stored(CAD_482).labels).toEqual(['Auth', 'Front']);
      expect(tasks.events).toEqual([]);
    },
  );
});

describe('RemoveTaskLabel: an archived task refuses the change with task-archived', () => {
  it('answers task-archived with its key, after the role and before If-Match, and writes nothing', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] });
    const useCase = new RemoveTaskLabel(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    expect(await refusalOf(useCase.execute(removeLabel({ expectedVersions: [3] })))).toEqual({
      reason: 'task-archived',
      key: 'CAD-482',
    });
    expect(tasks.stored(CAD_482)).toEqual(taskState({ archive: archiveFrom(CAD_482) }));
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });

  it('answers role-insufficient before task-archived', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] });
    const useCase = new RemoveTaskLabel(
      tasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'view' }),
    );

    expect(await refusalOf(useCase.execute(removeLabel({ actorUserId: HUGO })))).toEqual({
      reason: 'role-insufficient',
      role: 'view',
    });
  });
});
