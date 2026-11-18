import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  CLOTURES,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  MAQUETTES,
  NADIA,
  NOW,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  atelierNordMembers,
  refusalOf,
} from '../../../tasks.fixture.js';
import type { CreateTaskInput } from './create-task.input.js';
import { CreateTask } from './create-task.use-case.js';

/**
 * Builds the creation of "Configurer le domaine vérifié" in Sprint 14 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function createTask(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    listId: SPRINT_14,
    name: 'Configurer le domaine vérifié',
    description: null,
    status: 'todo',
    cancelReason: null,
    cancelNote: null,
    priority: 'moyenne',
    assigneeIds: [CAMILLE],
    dueDate: null,
    startDate: null,
    estimateMinutes: null,
    labels: [],
    subtaskNames: [],
    ...overrides,
  };
}

/** A use case on empty Atelier Nord whose last key is CAD-495, with the calls of every fake traced. */
function atelierNord(): {
  readonly tasks: InMemoryTasks;
  readonly spaces: InMemorySpaceDirectory;
  readonly useCase: CreateTask;
} {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ trace });
  const spaces = new InMemorySpaceDirectory({ trace });
  return { tasks, spaces, useCase: new CreateTask(tasks, atelierNordMembers([], trace), spaces) };
}

describe('CreateTask: a member creates a task in a list they see', () => {
  it('creates the task at version 1 under the next key of the space, with the defaults', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(createTask());

    expect(view).toMatchObject({
      key: 'CAD-496',
      name: 'Configurer le domaine vérifié',
      status: 'todo',
      priority: 'moyenne',
      assigneeIds: [CAMILLE],
      listId: SPRINT_14,
      parentKey: null,
      version: 1,
      completedAt: null,
      subtaskCounts: { total: 0, closed: 0 },
      checklist: [],
      createdBy: { type: 'user', id: CAMILLE },
    });
    expect(tasks.stored(view.id)).toMatchObject({ organizationId: ATELIER_NORD, version: 1 });
  });

  it('records one create entry, and no assign entry for the initial assignees', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(createTask({ assigneeIds: [CAMILLE, INES] }));

    expect(tasks.entriesOf(view.id)).toEqual([
      expect.objectContaining({
        listId: SPRINT_14,
        occurredAt: NOW,
        actor: { type: 'user', id: CAMILLE },
        change: { kind: 'create' },
      }),
    ]);
  });

  it('appends task.created.v1 then one task.assigned.v1 per assignee', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createTask({ assigneeIds: [CAMILLE, INES] }));

    const actor = { type: 'user', id: CAMILLE };
    expect(tasks.events).toEqual([
      { kind: 'created', key: 'CAD-496', version: 1, actor },
      { kind: 'assigned', key: 'CAD-496', version: 1, assigneeId: CAMILLE, actor },
      { kind: 'assigned', key: 'CAD-496', version: 1, assigneeId: INES, actor },
    ]);
  });

  it('counts an account named twice once', async () => {
    const { useCase } = atelierNord();

    const view = await useCase.execute(createTask({ assigneeIds: [INES, INES] }));

    expect(view.assigneeIds).toEqual([INES]);
  });

  it('sets the completion instant of a task created done', async () => {
    const { useCase } = atelierNord();

    const view = await useCase.execute(createTask({ status: 'done' }));

    expect(view.completedAt).toEqual(NOW);
  });

  it('locks the actor, then the assignees, and allocates the keys last', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createTask({ assigneeIds: [INES, CAMILLE] }));

    expect(tasks.trace).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      'spaces.findVisibleList',
      `members.roleOf:${CAMILLE}:lock`,
      `members.roleOf:${INES}:lock`,
      'spaces.allocateKeys',
      'tasks.insert',
      'events.created',
    ]);
  });
});

describe('CreateTask: the subtasks of the request take the next keys, the list and the first assignee', () => {
  it('creates each subtask after the task, in body order, in the same list', async () => {
    const { tasks, spaces, useCase } = atelierNord();

    const view = await useCase.execute(
      createTask({ assigneeIds: [INES, CAMILLE], subtaskNames: ['Maquette', 'Recette'] }),
    );

    expect(spaces.allocateCalls).toEqual([
      { organizationId: ATELIER_NORD, spaceId: PRODUIT, count: 3 },
    ]);
    expect(view.subtaskCounts).toEqual({ total: 2, closed: 0 });
    const subtasks = [...tasks.tasks.values()].filter((row) => row.parentId === view.id);
    expect(subtasks.map((row) => [row.key.format(), row.name])).toEqual([
      ['CAD-497', 'Maquette'],
      ['CAD-498', 'Recette'],
    ]);
    expect(subtasks).toEqual([
      expect.objectContaining({
        listId: SPRINT_14,
        status: 'todo',
        priority: 'moyenne',
        assigneeIds: [INES],
        parentId: view.id,
      }),
      expect.objectContaining({ listId: SPRINT_14, assigneeIds: [INES] }),
    ]);
  });

  it('appends the events of the task before those of each subtask', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createTask({ subtaskNames: ['Maquette'] }));

    expect(tasks.events.map((event) => [event.kind, event.key])).toEqual([
      ['created', 'CAD-496'],
      ['assigned', 'CAD-496'],
      ['created', 'CAD-497'],
      ['assigned', 'CAD-497'],
    ]);
  });

  it('records a create entry for the task and one for each subtask', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createTask({ subtaskNames: ['Maquette', 'Recette'] }));

    expect([...tasks.activity.values()].map((entry) => entry.change.kind)).toEqual([
      'create',
      'create',
      'create',
    ]);
  });

  it('gives a subtask no assignee when the task has none', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createTask({ assigneeIds: [], subtaskNames: ['Maquette'] }));

    const [subtask] = [...tasks.tasks.values()].filter((row) => row.parentId !== null);
    expect(subtask?.assigneeIds).toEqual([]);
  });
});

describe('CreateTask: what the actor does not see is not found', () => {
  it('refuses an account the copy does not hold as organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createTask({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });

  it('refuses another organization as organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(
      await refusalOf(useCase.execute(createTask({ organizationId: OTHER_ORGANIZATION }))),
    ).toEqual({ reason: 'organization-not-found' });
  });

  it.each([
    ['an unknown list', { listId: UNKNOWN_LIST }],
    ['a list of the private space of another member', { listId: MAQUETTES }],
    ['any list, for a guest', { actorUserId: NADIA, assigneeIds: [] }],
  ] as const)('refuses %s as list-not-found', async (_name, overrides) => {
    const { tasks, useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createTask(overrides)))).toEqual({
      reason: 'list-not-found',
    });
    expect(tasks.tasks.size).toBe(0);
  });
});

describe('CreateTask: the rules of the domain refuse the task and roll everything back', () => {
  it('refuses a status the space of the list no longer uses, with status-hidden', async () => {
    const { tasks, useCase } = atelierNord();

    expect(
      await refusalOf(useCase.execute(createTask({ listId: CLOTURES, status: 'testing' }))),
    ).toEqual({ reason: 'status-hidden', status: 'testing' });
    expect(tasks.tasks.size).toBe(0);
  });

  it('refuses a cancelled task without a reason', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createTask({ status: 'cancelled' })))).toEqual({
      reason: 'cancel-reason-required',
    });
  });

  it('refuses a cancel reason on a task that is not cancelled', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createTask({ cancelReason: 'duplicate' })))).toEqual({
      reason: 'cancel-reason-unexpected',
    });
  });

  it('refuses a start date without a due date', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createTask({ startDate: '2026-11-11' })))).toEqual({
      reason: 'start-date-invalid',
    });
  });

  it('refuses a guest and an unknown account as assignees, naming both', async () => {
    const { tasks, useCase } = atelierNord();

    const reason = await refusalOf(
      useCase.execute(createTask({ assigneeIds: [CAMILLE, NADIA, STRANGER], subtaskNames: ['A'] })),
    );

    expect(reason).toEqual({ reason: 'assignee-invalid', userIds: [NADIA, STRANGER] });
    expect(tasks.tasks.size).toBe(0);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });

  it('refuses a member of the organization who is a guest as the only assignee', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createTask({ assigneeIds: [HUGO, NADIA] })))).toEqual({
      reason: 'assignee-invalid',
      userIds: [NADIA],
    });
  });
});
