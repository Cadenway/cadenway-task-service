import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAMILLE,
  HUGO,
  HUGO_ACTOR,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  archiveFrom,
  atelierNordLists,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import type { CheckTaskAttachmentAccessInput } from './check-task-attachment-access.input.js';
import { CheckTaskAttachmentAccess } from './check-task-attachment-access.use-case.js';

function input(
  overrides: Partial<CheckTaskAttachmentAccessInput> = {},
): CheckTaskAttachmentAccessInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    mode: 'read',
    ...overrides,
  };
}

function setup(
  tasks = new InMemoryTasks({ tasks: [taskState()] }),
  spaces = new InMemorySpaceDirectory(),
): { readonly tasks: InMemoryTasks; readonly useCase: CheckTaskAttachmentAccess } {
  return { tasks, useCase: new CheckTaskAttachmentAccess(tasks, atelierNordMembers(), spaces) };
}

describe('CheckTaskAttachmentAccess', () => {
  it.each(['read', 'write'] as const)(
    'authorizes %s for an editor in one read-only snapshot',
    async (mode) => {
      const { tasks, useCase } = setup();

      await expect(useCase.execute(input({ mode }))).resolves.toBeUndefined();
      expect(tasks.runs).toBe(1);
      expect(tasks.readOnlyRuns).toBe(1);
      expect(tasks.snapshotRuns).toBe(1);
      expect(tasks.trace).toContain('reader.attachmentLocationByKey');
      expect(tasks.trace.filter((call) => call.startsWith('tasks.'))).toEqual([]);
      expect(tasks.events).toEqual([]);
    },
  );

  it.each(['view', 'comment'] as const)('allows %s to read but refuses a write', async (role) => {
    const { useCase } = setup(undefined, sprint14SharedWith({ [HUGO]: role }));

    await expect(useCase.execute(input({ actorUserId: HUGO }))).resolves.toBeUndefined();
    expect(await refusalOf(useCase.execute(input({ actorUserId: HUGO, mode: 'write' })))).toEqual({
      reason: 'role-insufficient',
      role,
    });
  });

  it('allows a guest whose list grant permits reading', async () => {
    const { useCase } = setup(undefined, sprint14SharedWith({ [NADIA]: 'view' }));
    await expect(useCase.execute(input({ actorUserId: NADIA }))).resolves.toBeUndefined();
    expect(await refusalOf(useCase.execute(input({ actorUserId: NADIA, mode: 'write' })))).toEqual({
      reason: 'role-insufficient',
      role: 'view',
    });
  });

  it('checks the current list after a task moves', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ listId: BUGS })] });
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({ organizationAccess: false }),
      listGrants: { [SPRINT_14]: { [NADIA]: 'edit' } },
    });
    expect(
      await refusalOf(setup(tasks, spaces).useCase.execute(input({ actorUserId: NADIA }))),
    ).toEqual({
      reason: 'task-not-found',
    });
  });

  it.each([{ actorUserId: STRANGER }, { organizationId: OTHER_ORGANIZATION }])(
    'refuses an inactive or missing organization membership',
    async (overrides) => {
      expect(await refusalOf(setup().useCase.execute(input(overrides)))).toEqual({
        reason: 'organization-not-found',
      });
    },
  );

  it.each([{ taskKey: 'cad-482' }, { taskKey: 'CAD-999' }, { actorUserId: NADIA }])(
    'masks an invalid, missing or invisible task',
    async (overrides) => {
      expect(await refusalOf(setup().useCase.execute(input(overrides)))).toEqual({
        reason: 'task-not-found',
      });
    },
  );

  it('masks a trashed task even from someone who could restore it', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ trash: trashIn() })] });
    expect(await refusalOf(setup(tasks).useCase.execute(input({ mode: 'write' })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it.each([
    new InMemorySpaceDirectory({ deletedLists: { [SPRINT_14]: HUGO_ACTOR } }),
    new InMemorySpaceDirectory({ deletedSpaces: { [PRODUIT]: HUGO_ACTOR } }),
  ])('masks a task in a deleted list or space', async (spaces) => {
    expect(await refusalOf(setup(undefined, spaces).useCase.execute(input()))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('allows reading an archived task and applies its domain rule to writes', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] });
    const { useCase } = setup(tasks);
    await expect(useCase.execute(input())).resolves.toBeUndefined();
    expect(await refusalOf(useCase.execute(input({ mode: 'write' })))).toEqual({
      reason: 'task-archived',
      key: 'CAD-482',
    });
  });

  it('allows reading an archived list and refuses writes', async () => {
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR }),
    });
    const { useCase } = setup(undefined, spaces);
    await expect(useCase.execute(input())).resolves.toBeUndefined();
    expect(await refusalOf(useCase.execute(input({ mode: 'write' })))).toEqual({
      reason: 'task-archived',
      key: 'CAD-482',
    });
  });

  it('checks the list role before disclosing archive state', async () => {
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({
        organizationAccess: false,
        archivedAt: ARCHIVED_AT,
        archivedBy: HUGO_ACTOR,
      }),
      listGrants: { [SPRINT_14]: { [HUGO]: 'view' } },
    });
    const tasks = new InMemoryTasks({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] });
    expect(
      await refusalOf(
        setup(tasks, spaces).useCase.execute(input({ actorUserId: HUGO, mode: 'write' })),
      ),
    ).toEqual({ reason: 'role-insufficient', role: 'view' });
    expect(
      await refusalOf(
        setup(tasks, spaces).useCase.execute(input({ actorUserId: INES, mode: 'write' })),
      ),
    ).toEqual({ reason: 'task-not-found' });
  });
});
