import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  CREATED_AT,
  DESIGN,
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
  subtaskState,
  taskState,
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

describe('GetTask: what the actor does not see is not found', () => {
  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['any task, for a guest', { actorUserId: NADIA }],
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
