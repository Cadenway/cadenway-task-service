import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_483,
  CAMILLE,
  CREATED_AT,
  DESIGN,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  MAQUETTES,
  NADIA,
  OTHER_ORGANIZATION,
  SPRINT_14,
  STRANGER,
  UPDATED_AT,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  subtaskState,
  taskState,
  archiveFrom,
  ARCHIVED_AT,
  HUGO_ACTOR,
  trashIn,
} from '../../../tasks.fixture.js';

import type { GetTaskInput } from './get-task.input.js';
import { GetTask } from './get-task.use-case.js';

/**
 * Builds the reading of CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<GetTaskInput> = {}): GetTaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
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
  readonly useCase: GetTask;
} {
  const tasks = new InMemoryTasks({ tasks: stored });
  return {
    tasks,
    useCase: new GetTask(tasks, atelierNordMembers(), new InMemorySpaceDirectory()),
  };
}

describe('GetTask: a member reads a task of a list they see', () => {
  it('reads the whole task with its checklist and its counts', async () => {
    const { useCase } = atelierNord([
      taskState(),
      subtaskState(),
      subtaskState({
        id: '019a7200-0000-7000-8000-000000000999',
        status: 'done',
        completedAt: UPDATED_AT,
      }),
    ]);

    const view = await useCase.execute(read());

    expect(view).toEqual({
      id: CAD_482,
      key: 'CAD-482',
      name: 'Refondre l’écran de connexion SSO',
      description: 'Remplacer l’écran actuel par la connexion d’entreprise.',
      status: 'progress',
      cancelReason: null,
      cancelNote: null,
      priority: 'haute',
      assigneeIds: [CAMILLE, INES],
      dueDate: '2026-11-12',
      startDate: '2026-11-11',
      estimateMinutes: 480,
      labels: ['Auth', 'Front'],
      parentKey: null,
      listId: SPRINT_14,
      spaceId: taskState().spaceId,
      subtaskCounts: { total: 2, closed: 1 },
      checklist: [
        { id: taskState().checklist[0]?.id, text: 'Maquette validée', done: true },
        { id: taskState().checklist[1]?.id, text: 'Recette en préproduction', done: false },
      ],
      checklistCounts: { total: 2, done: 1 },
      completedAt: null,
      createdAt: CREATED_AT,
      createdBy: { type: 'user', id: CAMILLE },
      updatedAt: UPDATED_AT,
      version: 12,
      archivedAt: null,
      archivedBy: null,
    });
  });

  it('takes no lock and writes nothing', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(read());

    expect(tasks.trace).toContain('tasks.findByKey:read');
    expect(tasks.trace).not.toContain('tasks.findByKey:lock');
    expect(tasks.events).toEqual([]);
  });
});

describe('GetTask: a read needs any role on the list of the task', () => {
  it.each(['view', 'comment'] as const)(
    'reads the task for a member with %s on its list',
    async (role) => {
      const useCase = new GetTask(
        InMemoryTasks.withCad482(),
        atelierNordMembers(),
        sprint14SharedWith({ [HUGO]: role }),
      );

      expect((await useCase.execute(read({ actorUserId: HUGO }))).key).toBe('CAD-482');
    },
  );

  it('reads it for a guest the list is shared with', async () => {
    const useCase = new GetTask(
      InMemoryTasks.withCad482(),
      atelierNordMembers(),
      sprint14SharedWith({ [NADIA]: 'view' }),
    );

    expect((await useCase.execute(read({ actorUserId: NADIA }))).key).toBe('CAD-482');
  });

  it('answers task-not-found to a member the list is closed to', async () => {
    const useCase = new GetTask(
      InMemoryTasks.withCad482(),
      atelierNordMembers(),
      sprint14SharedWith({}),
    );

    expect(await refusalOf(useCase.execute(read({ actorUserId: INES })))).toEqual({
      reason: 'task-not-found',
    });
  });
});

describe('GetTask: what the actor does not see is not found', () => {
  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['a task of no list shared with a guest', { actorUserId: NADIA }],
  ] as const)('answers %s as task-not-found', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(read(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('answers another organization as organization-not-found, whatever the task key', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(read({ organizationId: OTHER_ORGANIZATION })))).toEqual({
      reason: 'organization-not-found',
    });
  });

  it('answers a task of the private space of another member as task-not-found', async () => {
    const { useCase } = atelierNord([taskState({ listId: MAQUETTES, spaceId: DESIGN })]);

    expect(await refusalOf(useCase.execute(read()))).toEqual({ reason: 'task-not-found' });
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('GetTask: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });

    await new GetTask(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute(read());

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
  });
});

describe('GetTask: an archived task reads by its key', () => {
  it('answers the task with its archive and its version', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] });
    const useCase = new GetTask(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    const view = await useCase.execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      taskKey: 'CAD-482',
    });

    expect(view).toMatchObject({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR, version: 12 });
  });

  it('reads an archived root whose live parent moved to another list as detached', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState({ listId: BUGS }),
        subtaskState({ archive: archiveFrom(CAD_483), version: 2 }),
      ],
    });
    const useCase = new GetTask(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    const view = await useCase.execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      taskKey: 'CAD-483',
    });

    expect(view).toMatchObject({ key: 'CAD-483', parentKey: null, listId: SPRINT_14 });
    expect(tasks.stored(CAD_483).parentId).toBe(CAD_482);
  });

  it('reads an archived root whose parent is in the trash as detached, its stored parent kept', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState({ trash: trashIn(), version: 13 }),
        subtaskState({ archive: archiveFrom(CAD_483), version: 2 }),
      ],
    });
    const useCase = new GetTask(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    const view = await useCase.execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      taskKey: 'CAD-483',
    });

    expect(view).toMatchObject({ key: 'CAD-483', parentKey: null });
    expect(tasks.stored(CAD_483).parentId).toBe(CAD_482);
  });

  it('keeps the parent of an archived subtask in the list of its parent', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState({ archive: archiveFrom(CAD_482), version: 13 }),
        subtaskState({ archive: archiveFrom(CAD_482), version: 2 }),
      ],
    });
    const useCase = new GetTask(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    const view = await useCase.execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      taskKey: 'CAD-483',
    });

    expect(view.parentKey).toBe('CAD-482');
  });
});
