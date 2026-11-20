import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  CLOTURES,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  LEA,
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
  sprint14SharedWith,
} from '../../../tasks.fixture.js';
import type { HeldList } from '../../../../models/placement/held-list.model.js';
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

  it('creates ordered unchecked checklist items with new IDs at version one', async () => {
    const { tasks, useCase } = atelierNord();
    const input = createTask({ checklistTexts: [' First ', 'Second'] });
    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(first.version).toBe(1);
    expect(first.checklist).toEqual([
      expect.objectContaining({ text: 'First', done: false }),
      expect.objectContaining({ text: 'Second', done: false }),
    ]);
    expect(tasks.stored(first.id).checklist).toEqual([
      { ...first.checklist[0], position: 0 },
      { ...first.checklist[1], position: 1 },
    ]);
    const ids: string[] = [...first.checklist, ...second.checklist].map((item) => item.id);
    expect(new Set(ids).size).toBe(4);
    expect(tasks.events.map((event) => event.kind)).toEqual([
      'created',
      'assigned',
      'created',
      'assigned',
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

  it('creates the checklist and stores mentions before appending the recipient fact', async () => {
    const { tasks, useCase } = atelierNord();
    const descriptionMentions = [{ userId: HUGO, start: 2, end: 7 }];
    const view = await useCase.execute(
      createTask({
        description: '😀 @Hugo',
        descriptionMentions,
        checklistTexts: ['Verify access'],
      }),
    );

    expect(tasks.stored(view.id).descriptionMentions).toEqual(descriptionMentions);
    expect(tasks.stored(view.id).checklist).toEqual([
      expect.objectContaining({ text: 'Verify access', done: false, position: 0 }),
    ]);
    expect(tasks.events.at(-1)).toEqual({
      kind: 'descriptionMentionsChanged',
      key: view.key,
      version: 1,
      change: { added: [HUGO], removed: [] },
      actor: { type: 'user', id: CAMILLE },
    });
  });

  it('refuses unavailable recipients before allocating a task key', async () => {
    const { tasks, useCase } = atelierNord();
    const result = await refusalOf(
      useCase.execute(
        createTask({
          description: '@Unknown',
          descriptionMentions: [{ userId: STRANGER, start: 0, end: 8 }],
        }),
      ),
    );
    expect(result).toEqual({ reason: 'mention-recipient-invalid' });
    expect(tasks.trace).not.toContain('spaces.allocateKeys');
    expect(tasks.events).toEqual([]);
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

  it('locks the actor, then the assignees, holds the list and allocates the keys last', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createTask({ assigneeIds: [INES, CAMILLE] }));

    expect(tasks.trace).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      'spaces.findVisibleList',
      `members.roleOf:${CAMILLE}:lock`,
      `members.roleOf:${INES}:lock`,
      'spaces.holdList',
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

  it('stores the task with one insert and all the subtasks with one more, whatever their number', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(
      createTask({ subtaskNames: ['Maquette', 'Recette', 'Revue', 'Livraison'] }),
    );

    expect(tasks.trace.filter((call) => call === 'tasks.insert')).toHaveLength(1);
    expect(tasks.trace.filter((call) => call === 'tasks.insertMany')).toHaveLength(1);
    expect(tasks.trace.indexOf('spaces.allocateKeys')).toBeLessThan(
      tasks.trace.indexOf('tasks.insert'),
    );
  });

  it('does not call the multi-row insert for a task without subtask', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createTask({ subtaskNames: [] }));

    expect(tasks.trace).not.toContain('tasks.insertMany');
  });

  it('gives the subtasks the keys after the one of the task, in body order', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createTask({ subtaskNames: ['Maquette', 'Recette', 'Revue'] }));

    expect(
      [...tasks.tasks.values()].map((row) => [row.key.format(), row.name, row.parentId === null]),
    ).toEqual([
      ['CAD-496', 'Configurer le domaine vérifié', true],
      ['CAD-497', 'Maquette', false],
      ['CAD-498', 'Recette', false],
      ['CAD-499', 'Revue', false],
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
    ['a list not shared with a guest', { actorUserId: NADIA, assigneeIds: [] }],
  ] as const)('refuses %s as list-not-found', async (_name, overrides) => {
    const { tasks, useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createTask(overrides)))).toEqual({
      reason: 'list-not-found',
    });
    expect(tasks.tasks.size).toBe(0);
  });
});

describe('CreateTask: a deleted list takes no new task', () => {
  it('refuses a deleted list as list-not-found, as an unseen one', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ trace });
    const spaces = new InMemorySpaceDirectory({
      trace,
      deletedLists: { [SPRINT_14]: { type: 'user', id: CAMILLE } },
    });
    const useCase = new CreateTask(tasks, atelierNordMembers([], trace), spaces);

    expect(await refusalOf(useCase.execute(createTask()))).toEqual({ reason: 'list-not-found' });
    expect(spaces.allocateCalls).toEqual([]);
  });

  it('refuses a list deleted while the creation ran, seen under its hold, and allocates no key', async () => {
    /** A directory that sees Sprint 14 live, then deleted under the hold of the creation. */
    class DeletedUnderHold extends InMemorySpaceDirectory {
      // #region Methods
      /**
       * Answers the list deleted.
       *
       * @returns The list, deleted by Camille Martin.
       */
      public override holdList(): Promise<HeldList> {
        return Promise.resolve({ outcome: 'deleted', deletedBy: { type: 'user', id: CAMILLE } });
      }
      // #endregion
    }
    const tasks = new InMemoryTasks();
    const spaces = new DeletedUnderHold();
    const useCase = new CreateTask(tasks, atelierNordMembers(), spaces);

    expect(await refusalOf(useCase.execute(createTask()))).toEqual({ reason: 'list-not-found' });
    expect(spaces.allocateCalls).toEqual([]);
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

describe('CreateTask: a creation needs edit on the list', () => {
  /**
   * Builds the use case over the spaces of Atelier Nord with Sprint 14 shared with some accounts.
   *
   * @param grants - The role of each account Sprint 14 is shared with.
   * @returns The fake store, the fake spaces and the use case.
   */
  function sharedSprint14(grants: Parameters<typeof sprint14SharedWith>[0]): {
    readonly tasks: InMemoryTasks;
    readonly spaces: InMemorySpaceDirectory;
    readonly useCase: CreateTask;
  } {
    const tasks = new InMemoryTasks();
    const spaces = sprint14SharedWith(grants);
    return { tasks, spaces, useCase: new CreateTask(tasks, atelierNordMembers(), spaces) };
  }

  it.each(['view', 'comment'] as const)(
    'refuses a member with %s on the list as role-insufficient, before any key is taken',
    async (role) => {
      const { tasks, spaces, useCase } = sharedSprint14({ [HUGO]: role });

      expect(
        await refusalOf(useCase.execute(createTask({ actorUserId: HUGO, assigneeIds: [] }))),
      ).toEqual({ reason: 'role-insufficient', role });
      expect(tasks.tasks.size).toBe(0);
      expect(spaces.allocateCalls).toEqual([]);
    },
  );

  it('answers list-not-found before role-insufficient for a list the actor has no role on', async () => {
    const { useCase } = sharedSprint14({ [HUGO]: 'view' });

    expect(
      await refusalOf(useCase.execute(createTask({ actorUserId: LEA, assigneeIds: [] }))),
    ).toEqual({ reason: 'list-not-found' });
  });

  it('lets a guest with edit on the list create a task in it', async () => {
    const { tasks, useCase } = sharedSprint14({ [NADIA]: 'edit' });

    const view = await useCase.execute(createTask({ actorUserId: NADIA, assigneeIds: [HUGO] }));

    expect(view).toMatchObject({ key: 'CAD-496', listId: SPRINT_14, assigneeIds: [HUGO] });
    expect(tasks.events[0]).toMatchObject({ kind: 'created', actor: { type: 'user', id: NADIA } });
  });
});
