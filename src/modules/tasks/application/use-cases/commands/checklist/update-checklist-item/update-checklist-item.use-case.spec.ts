import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  InMemorySpaceDirectory,
  InMemoryTasks,
  MAQUETTE_VALIDEE,
  NADIA,
  RECETTE,
  atelierNordMembers,
  refusalOf,
  taskState,
} from '../../../tasks.fixture.js';
import type { UpdateChecklistItemInput } from './update-checklist-item.input.js';
import { UpdateChecklistItem } from './update-checklist-item.use-case.js';

/**
 * Builds the ticking of "Recette en préproduction" of CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function tick(overrides: Partial<UpdateChecklistItemInput> = {}): UpdateChecklistItemInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    checklistItemId: RECETTE,
    done: true,
    expectedVersions: null,
    ...overrides,
  };
}

/** A use case on Atelier Nord holding CAD-482. */
function atelierNord(): { readonly tasks: InMemoryTasks; readonly useCase: UpdateChecklistItem } {
  const tasks = new InMemoryTasks({ tasks: [taskState()] });
  return {
    tasks,
    useCase: new UpdateChecklistItem(tasks, atelierNordMembers(), new InMemorySpaceDirectory()),
  };
}

describe('UpdateChecklistItem: an item is ticked or unticked', () => {
  it('ticks the item, takes the next version and appends task.updated.v1', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(tick());

    expect(view).toMatchObject({ version: 13, checklistCounts: { total: 2, done: 2 } });
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

  it('unticks a ticked item', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(tick({ checklistItemId: MAQUETTE_VALIDEE, done: false }));

    expect(tasks.stored(CAD_482).checklist[0]).toMatchObject({ done: false });
  });

  it('changes nothing for an item already in the asked state', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(tick({ done: false }));

    expect(view.version).toBe(12);
    expect(tasks.events).toEqual([]);
  });
});

describe('UpdateChecklistItem: the refusals', () => {
  it('refuses an item the task does not have with checklist-item-not-found', async () => {
    const { useCase } = atelierNord();

    expect(
      await refusalOf(
        useCase.execute(tick({ checklistItemId: '019a7300-0000-7000-8000-0000000000ff' })),
      ),
    ).toEqual({ reason: 'checklist-item-not-found' });
  });

  it('refuses another version with the stored one', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(tick({ expectedVersions: [5] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
  });

  it('refuses a guest as task-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(tick({ actorUserId: NADIA })))).toEqual({
      reason: 'task-not-found',
    });
  });
});
