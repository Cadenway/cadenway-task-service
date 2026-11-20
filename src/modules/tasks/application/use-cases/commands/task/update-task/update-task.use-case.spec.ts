import { describe, expect, it, vi } from 'vitest';

import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { CustomFieldRepository } from '../../../../ports/outbound/persistence/custom-field/custom-field-repository.port.js';
import {
  ARCHIVES,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_483,
  CAD_484,
  CAD_490,
  CAMILLE,
  CLOTURES,
  DESIGN,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  LEA,
  MAQUETTES,
  NADIA,
  NOW,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  atelierNordLists,
  atelierNordMembers,
  cad490State,
  refusalOf,
  sprint14SharedWith,
  subtaskState,
  taskState,
  archiveFrom,
  storedEntry,
  trashIn,
} from '../../../tasks.fixture.js';

import type { UpdateTaskInput } from './update-task.input.js';
import { UpdateTask } from './update-task.use-case.js';

/** CAD-484, a subtask of CAD-483, itself a subtask of CAD-482. */
function grandchild(): TaskState {
  return subtaskState({
    id: CAD_484,
    key: TaskKey.of('CAD', 484),
    parentId: CAD_483,
    parentKey: TaskKey.of('CAD', 483),
    name: 'Libellé du bouton',
  });
}

/** CAD-482 with its subtask CAD-483 and its sub-subtask CAD-484. */
function tree(): TaskState[] {
  return [taskState(), subtaskState(), grandchild()];
}

/**
 * Builds the patch of CAD-482 by Camille Martin.
 *
 * @param patch - The members the request names.
 * @param overrides - What replaces the rest of the input.
 * @returns The input.
 */
function patchOf(
  patch: UpdateTaskInput['patch'],
  overrides: Partial<UpdateTaskInput> = {},
): UpdateTaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    expectedVersions: null,
    patch,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord holding the given tasks.
 *
 * @param stored - The tasks.
 * @returns The fake store and the use case.
 */
function atelierNord(stored: readonly TaskState[] = [taskState()]): {
  readonly tasks: InMemoryTasks;
  readonly useCase: UpdateTask;
} {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: stored, trace });
  return {
    tasks,
    useCase: new UpdateTask(
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    ),
  };
}

const camille = { type: 'user', id: CAMILLE } as const;

describe('UpdateTask custom field values', () => {
  const fieldId = '019a7000-0000-7000-8000-000000001001';
  const definition = {
    id: fieldId,
    spaceId: PRODUIT,
    name: 'Points',
    type: 'number',
    position: 0,
    sprintPoints: true,
    version: 1,
  } as const;

  function setup(initial?: number) {
    let value = initial;
    const cleared: string[] = [];
    const customFields: CustomFieldRepository = {
      allocateId: () => Promise.resolve(fieldId),
      activeDefinitions: (_organizationId, spaceId) =>
        Promise.resolve(spaceId === PRODUIT ? [definition] : []),
      create: () => Promise.resolve(),
      saveDefinitions: () => Promise.resolve(),
      retire: () => Promise.resolve(),
      hasNegativeValues: () => Promise.resolve(false),
      valuesForTasks: (_organizationId, spaceId, ids) =>
        Promise.resolve(
          spaceId === PRODUIT && value !== undefined && ids.includes(CAD_482)
            ? [{ taskId: CAD_482, fieldId, value }]
            : [],
        ),
      valuesForTaskPage: () =>
        Promise.resolve(value === undefined ? [] : [{ taskId: CAD_482, fieldId, value }]),
      applyValues: (_organizationId, _taskId, changes) => {
        const next = changes[0]?.value;
        if (typeof next === 'number') value = next;
        if (next === null) value = undefined;
        return Promise.resolve();
      },
      clearTasks: (_organizationId, ids) => {
        cleared.push(...ids);
        if (ids.includes(CAD_482)) value = undefined;
        return Promise.resolve();
      },
    };
    const tasks = new InMemoryTasks({ tasks: tree(), customFields });
    const spaces = new InMemorySpaceDirectory();
    return {
      tasks,
      spaces,
      customFields,
      cleared,
      value: () => value,
      useCase: new UpdateTask(tasks, atelierNordMembers(), spaces),
    };
  }

  it('saves a value-only patch once and keeps a repeated patch as a no-op', async () => {
    const { tasks, spaces, useCase, value } = setup();
    const hold = vi.spyOn(spaces, 'lockTrashLists');
    expect((await useCase.execute(patchOf({ customFieldValues: { [fieldId]: 0 } }))).version).toBe(
      13,
    );
    expect(value()).toBe(0);
    expect(hold).toHaveBeenCalled();
    expect(tasks.events).toEqual([
      {
        kind: 'updated',
        key: 'CAD-482',
        version: 13,
        changed: ['customFieldValues'],
        actor: camille,
      },
    ]);
    expect((await useCase.execute(patchOf({ customFieldValues: { [fieldId]: 0 } }))).version).toBe(
      13,
    );
    expect(tasks.events).toHaveLength(1);
  });

  it('refuses a negative sprint value before saving or publishing', async () => {
    const { tasks, useCase } = setup();
    expect(
      await refusalOf(useCase.execute(patchOf({ customFieldValues: { [fieldId]: -1 } }))),
    ).toEqual({
      reason: 'custom-field-value-invalid',
    });
    expect(tasks.stored(CAD_482).version).toBe(12);
    expect(tasks.events).toEqual([]);
  });

  it('removes values from every moved task and includes the changed marker only where needed', async () => {
    const { tasks, useCase, value, cleared } = setup(3);
    await useCase.execute(patchOf({ listId: CLOTURES }));
    expect(value()).toBeUndefined();
    expect(cleared).toEqual(expect.arrayContaining([CAD_482, CAD_483, CAD_484]));
    expect(tasks.events[0]).toMatchObject({ changed: ['listId', 'spaceId', 'customFieldValues'] });
    expect(tasks.events[1]).toMatchObject({ changed: ['listId', 'spaceId'] });
  });

  it('validates a move and value patch against the destination definitions', async () => {
    const { tasks, useCase, customFields, value } = setup(3);
    const destinationFieldId = '019a7000-0000-7000-8000-000000001002';
    vi.spyOn(customFields, 'activeDefinitions').mockImplementation((_organizationId, spaceId) =>
      Promise.resolve(
        spaceId === ARCHIVES ? [{ ...definition, id: destinationFieldId, spaceId }] : [],
      ),
    );

    const result = await useCase.execute(
      patchOf({ listId: CLOTURES, customFieldValues: { [destinationFieldId]: 7 } }),
    );

    expect(result).toMatchObject({ spaceId: ARCHIVES, version: 13 });
    expect(value()).toBe(7);
    expect(tasks.events[0]).toMatchObject({
      changed: ['listId', 'spaceId', 'customFieldValues'],
    });
  });
});

describe('UpdateTask: a patch changes what it names and nothing else', () => {
  it('renames the task, takes the next version and appends task.updated.v1', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(patchOf({ name: '  Refondre SSO  ' }));

    expect(view).toMatchObject({ name: 'Refondre SSO', version: 13, status: 'progress' });
    expect(tasks.stored(CAD_482)).toMatchObject({
      name: 'Refondre SSO',
      version: 13,
      updatedAt: NOW,
    });
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-482', version: 13, changed: ['name'], actor: camille },
    ]);
    expect(tasks.activity.size).toBe(0);
  });

  it('writes nothing, records nothing and emits nothing for a patch that changes nothing', async () => {
    const { tasks, useCase } = atelierNord();
    const before = tasks.stored(CAD_482);

    const view = await useCase.execute(patchOf({ name: before.name, priority: 'haute' }));

    expect(view.version).toBe(12);
    expect(tasks.stored(CAD_482)).toBe(before);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
    expect(tasks.trace).not.toContain('tasks.save');
  });

  it('answers the stored version for an empty patch', async () => {
    const { useCase } = atelierNord();

    expect((await useCase.execute(patchOf({}))).version).toBe(12);
  });

  it('keeps the subtask counts in the view', async () => {
    const { useCase } = atelierNord(tree());

    const view = await useCase.execute(patchOf({ name: 'Refonte' }));

    expect(view.subtaskCounts).toEqual({ total: 1, closed: 0 });
  });
});

describe('UpdateTask: the status, the cancellation and the completion', () => {
  it('holds the effective audience when milestone conversion implicitly changes progress to todo', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(patchOf({ milestone: true }));

    expect(view).toMatchObject({ milestone: true, status: 'todo', version: 13 });
    expect(tasks.events.find((event) => event.kind === 'statusChanged')).toMatchObject({
      previousStatus: 'progress',
      watcherIds: [CAMILLE, INES].sort(),
    });
    expect(tasks.events.filter((event) => event.kind === 'milestoneReached')).toEqual([]);
    expect(tasks.trace.indexOf(`members.roleOf:${INES}:lock`)).toBeLessThan(
      tasks.trace.indexOf('tasks.findByKey:lock'),
    );
  });

  it('emits the milestone fact once with the same effective audience as the status fact', async () => {
    const { tasks, useCase } = atelierNord([
      taskState({
        milestone: true,
        status: 'todo',
        estimateMinutes: null,
        dueDate: '2026-11-12',
        startDate: '2026-11-12',
      }),
    ]);

    await useCase.execute(patchOf({ status: 'done' }));
    await useCase.execute(patchOf({ status: 'done' }));

    expect(tasks.events.filter((event) => event.kind === 'milestoneReached')).toEqual([
      expect.objectContaining({ key: 'CAD-482', version: 13, watcherIds: [CAMILLE, INES].sort() }),
    ]);
    expect(tasks.events.find((event) => event.kind === 'statusChanged')).toMatchObject({
      watcherIds: [CAMILLE, INES].sort(),
    });
  });

  it('completes a recurring task and creates exactly one fresh occurrence', async () => {
    const { tasks, useCase } = atelierNord([
      taskState({
        recurrence: 'weekly',
        dueDate: '2026-11-12',
        startDate: '2026-11-10',
        assigneeIds: [CAMILLE],
      }),
    ]);

    const view = await useCase.execute(patchOf({ status: 'done' }));

    expect(view).toMatchObject({
      status: 'done',
      version: 13,
      recurrence: 'none',
      nextOccurrenceKey: 'CAD-496',
    });
    expect(tasks.stored(CAD_482).nextOccurrenceKey?.format()).toBe('CAD-496');
    expect([...tasks.tasks.values()].find((row) => row.key.format() === 'CAD-496')).toMatchObject({
      status: 'todo',
      version: 1,
      recurrence: 'weekly',
      dueDate: '2026-11-19',
      startDate: '2026-11-17',
      parentId: null,
      assigneeIds: [CAMILLE],
    });
    expect(tasks.events.map((event) => event.kind)).toEqual([
      'updated',
      'statusChanged',
      'created',
      'assigned',
      'occurrenceCreated',
    ]);
    const next = await useCase.execute(patchOf({ status: 'done' }));
    expect(next.version).toBe(13);
    expect(tasks.events.filter((event) => event.kind === 'occurrenceCreated')).toHaveLength(1);
  });

  it('rolls back the predecessor and successor if appending the occurrence fact fails', async () => {
    const original = taskState({
      recurrence: 'weekly',
      dueDate: '2026-11-12',
      startDate: null,
      assigneeIds: [CAMILLE],
    });
    const tasks = new InMemoryTasks({ tasks: [original] });
    const failingWork: TasksUnitOfWork = {
      run: (operation) =>
        tasks.run((store) =>
          operation({
            ...store,
            events: {
              ...store.events,
              taskOccurrenceCreated: () => Promise.reject(new Error('outbox failed')),
            },
          }),
        ),
      runReadOnly: (operation, options) => tasks.runReadOnly(operation, options),
    };
    const useCase = new UpdateTask(failingWork, atelierNordMembers(), new InMemorySpaceDirectory());

    await expect(useCase.execute(patchOf({ status: 'done' }))).rejects.toThrow('outbox failed');
    expect(tasks.stored(CAD_482)).toEqual(original);
    expect(tasks.tasks.size).toBe(1);
    expect(tasks.activity.size).toBe(0);
    expect(tasks.events).toEqual([]);
  });

  it('holds copied assignee memberships before the task lock and skips a guest', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({
      tasks: [
        taskState({
          recurrence: 'weekly',
          dueDate: '2026-11-12',
          startDate: null,
          assigneeIds: [INES, NADIA],
        }),
      ],
      trace,
    });
    const useCase = new UpdateTask(
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    );

    await useCase.execute(patchOf({ status: 'done' }));
    const lockedTask = trace.indexOf('tasks.findByKey:lock');
    expect(trace.indexOf(`members.roleOf:${INES}:lock`)).toBeLessThan(lockedTask);
    expect(trace.indexOf(`members.roleOf:${NADIA}:lock`)).toBeLessThan(lockedTask);
    expect([...tasks.tasks.values()].find((row) => row.key.format() === 'CAD-496')).toMatchObject({
      assigneeIds: [INES],
    });
  });

  it('records a status entry and appends task.updated.v1 then task.status-changed.v1', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(patchOf({ status: 'review' }));

    expect(tasks.entriesOf(CAD_482)).toEqual([
      expect.objectContaining({
        change: { kind: 'status', status: { from: 'progress', to: 'review' } },
        actor: camille,
        listId: SPRINT_14,
      }),
    ]);
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-482', version: 13, changed: ['status'], actor: camille },
      {
        kind: 'statusChanged',
        key: 'CAD-482',
        version: 13,
        previousStatus: 'progress',
        actor: camille,
        watcherIds: [CAMILLE, INES].sort(),
      },
    ]);
  });

  it('uses the resulting list to determine the audience when a status patch also moves the task', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: [taskState()], trace });
    const spaces = new InMemorySpaceDirectory({
      trace,
      lists: atelierNordLists().map((list) =>
        list.id === BUGS ? { ...list, organizationAccess: false } : list,
      ),
      listGrants: { [BUGS]: { [CAMILLE]: 'edit' } },
    });
    await new UpdateTask(tasks, atelierNordMembers([], trace), spaces).execute(
      patchOf({ status: 'review', listId: BUGS }),
    );

    expect(tasks.events.find((event) => event.kind === 'statusChanged')).toMatchObject({
      watcherIds: [CAMILLE],
    });
    expect(spaces.lockTrashCalls.map(({ listIds }) => listIds)).toEqual([[SPRINT_14, BUGS]]);
    expect(trace.filter((entry) => entry === 'tasks.lockByIds')).toHaveLength(1);
    expect(trace.indexOf(`members.roleOf:${INES}:lock`)).toBeLessThan(
      trace.indexOf('tasks.lockByIds'),
    );
    expect(trace.indexOf('tasks.lockByIds')).toBeLessThan(trace.indexOf('spaces.lockTrashLists'));
  });

  it('retries an audience that gains a watcher after preflight and commits the status once', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: [taskState()], trace });
    const members = atelierNordMembers([], trace);
    const list = vi
      .fn<TasksStore['watcherOverrides']['list']>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ userId: HUGO, following: true }]);
    const unit: TasksUnitOfWork = {
      run: (work) =>
        tasks.run((store) =>
          work({ ...store, watcherOverrides: { ...store.watcherOverrides, list } }),
        ),
      runReadOnly: (work, options) => tasks.runReadOnly(work, options),
    };
    const useCase = new UpdateTask(unit, members, new InMemorySpaceDirectory({ trace }));

    expect(await useCase.execute(patchOf({ status: 'review' }))).toMatchObject({
      status: 'review',
      version: 13,
    });

    expect(list.mock.calls).toEqual(Array.from({ length: 4 }, () => [ATELIER_NORD, CAD_482]));
    expect(trace.filter((entry) => entry === 'tasks.findByKey:lock')).toHaveLength(2);
    expect(trace.filter((entry) => entry.startsWith(`members.roleOf:${HUGO}:`))).toEqual([
      `members.roleOf:${HUGO}:lock`,
    ]);
    const acquired = trace.indexOf(`members.roleOf:${HUGO}:lock`);
    expect(acquired).toBeGreaterThan(trace.indexOf('tasks.findByKey:lock'));
    expect(acquired).toBeLessThan(trace.lastIndexOf('tasks.findByKey:lock'));
    expect(trace.filter((entry) => entry === 'tasks.save')).toHaveLength(1);
    expect(tasks.stored(CAD_482).version).toBe(13);
    expect(tasks.entriesOf(CAD_482)).toHaveLength(1);
    expect(tasks.events).toMatchObject([
      { kind: 'updated', version: 13 },
      { kind: 'statusChanged', version: 13, watcherIds: [CAMILLE, HUGO, INES].sort() },
    ]);
  });

  it('does not merge two status changes of the same actor', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(patchOf({ status: 'review' }));
    await useCase.execute(patchOf({ status: 'progress' }));

    expect(tasks.entriesOf(CAD_482).map((entry) => entry.change.kind)).toEqual([
      'status',
      'status',
    ]);
  });

  it('sets the completion instant when the task enters done', async () => {
    const { useCase } = atelierNord();

    expect((await useCase.execute(patchOf({ status: 'done' }))).completedAt).toEqual(NOW);
  });

  it('cancels the task with its reason and note, and names them in the changed fields', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(
      patchOf({ status: 'cancelled', cancelReason: 'duplicate', cancelNote: ' CAD-470 ' }),
    );

    expect(view).toMatchObject({
      status: 'cancelled',
      cancelReason: 'duplicate',
      cancelNote: 'CAD-470',
    });
    expect(tasks.events[0]).toMatchObject({
      kind: 'updated',
      changed: ['status', 'cancelReason', 'cancelNote'],
    });
  });

  it('refuses a cancellation without a reason', async () => {
    const { tasks, useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(patchOf({ status: 'cancelled' })))).toEqual({
      reason: 'cancel-reason-required',
    });
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it('refuses a cancel reason on a task that is not cancelled', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(patchOf({ cancelReason: 'scope' })))).toEqual({
      reason: 'cancel-reason-unexpected',
    });
  });

  it('refuses a new status that the space of the task no longer uses', async () => {
    const { useCase } = atelierNord([taskState({ listId: CLOTURES, spaceId: ARCHIVES })]);

    expect(await refusalOf(useCase.execute(patchOf({ status: 'testing' })))).toEqual({
      reason: 'status-hidden',
      status: 'testing',
    });
  });
});

describe('UpdateTask: the schedule', () => {
  it('moves the start with the due date and records a due entry only', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(patchOf({ dueDate: '2026-11-14' }));

    expect(view).toMatchObject({ dueDate: '2026-11-14', startDate: '2026-11-13' });
    expect(tasks.events[0]).toMatchObject({ changed: ['dueDate', 'startDate'] });
    expect(tasks.entriesOf(CAD_482)).toEqual([
      expect.objectContaining({
        change: { kind: 'due', dueDate: { from: '2026-11-12', to: '2026-11-14' } },
      }),
    ]);
  });

  it('refuses a start date after the due date', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(patchOf({ startDate: '2026-11-20' })))).toEqual({
      reason: 'start-date-invalid',
    });
  });
});

describe('UpdateTask: priority and due date changes of one actor merge within 60 seconds', () => {
  it('merges two changes of the same actor and deletes the entry when the value is back', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(patchOf({ priority: 'urgente' }));
    tasks.now = new Date(NOW.getTime() + 30_000);
    await useCase.execute(patchOf({ priority: 'basse' }));

    expect(tasks.entriesOf(CAD_482)).toEqual([
      expect.objectContaining({
        change: { kind: 'priority', priority: { from: 'haute', to: 'basse' } },
        occurredAt: tasks.now,
      }),
    ]);

    tasks.now = new Date(NOW.getTime() + 45_000);
    await useCase.execute(patchOf({ priority: 'haute' }));

    expect(tasks.entriesOf(CAD_482)).toEqual([]);
    expect(tasks.stored(CAD_482).version).toBe(15);
  });

  it('keeps two entries when the second change is more than 60 seconds later', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(patchOf({ priority: 'urgente' }));
    tasks.now = new Date(NOW.getTime() + 61_000);
    await useCase.execute(patchOf({ priority: 'basse' }));

    expect(tasks.entriesOf(CAD_482)).toHaveLength(2);
  });

  it('keeps two entries when another actor makes the second change', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(patchOf({ priority: 'urgente' }));
    tasks.now = new Date(NOW.getTime() + 10_000);
    await useCase.execute(patchOf({ priority: 'basse' }, { actorUserId: INES }));

    expect(tasks.entriesOf(CAD_482).map((entry) => entry.actor.id)).toEqual([CAMILLE, INES]);
  });

  it('merges due date changes the same way', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(patchOf({ dueDate: '2026-11-14' }));
    tasks.now = new Date(NOW.getTime() + 20_000);
    await useCase.execute(patchOf({ dueDate: '2026-11-16' }));

    expect(tasks.entriesOf(CAD_482)).toEqual([
      expect.objectContaining({
        change: { kind: 'due', dueDate: { from: '2026-11-12', to: '2026-11-16' } },
      }),
    ]);
  });
});

describe('UpdateTask: If-Match is checked after visibility and before the rules of the domain', () => {
  it('refuses another version with the stored one, before the domain refuses the patch', async () => {
    const { tasks, useCase } = atelierNord();

    const reason = await refusalOf(
      useCase.execute(patchOf({ status: 'cancelled' }, { expectedVersions: [11] })),
    );

    expect(reason).toEqual({ reason: 'version-mismatch', version: 12 });
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it('accepts any of the versions the header names', async () => {
    const { useCase } = atelierNord();

    const view = await useCase.execute(patchOf({ name: 'Refonte' }, { expectedVersions: [3, 12] }));

    expect(view.version).toBe(13);
  });

  it('answers task-not-found, not a mismatch, to an actor who does not see the task', async () => {
    const { useCase } = atelierNord([taskState({ listId: MAQUETTES, spaceId: DESIGN })]);

    expect(
      await refusalOf(useCase.execute(patchOf({ name: 'x' }, { expectedVersions: [1] }))),
    ).toEqual({ reason: 'task-not-found' });
  });
});

describe('UpdateTask: what the actor does not see is not found', () => {
  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['a task of no list shared with a guest', { actorUserId: NADIA }],
  ] as const)('refuses %s as task-not-found', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(patchOf({ name: 'x' }, overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(
      await refusalOf(useCase.execute(patchOf({ name: 'x' }, { actorUserId: STRANGER }))),
    ).toEqual({ reason: 'organization-not-found' });
  });
});

describe('UpdateTask: a move brings the descendants along', () => {
  it('moves the task and each descendant, one task.updated.v1 and one version each', async () => {
    const { tasks, useCase } = atelierNord(tree());

    const view = await useCase.execute(patchOf({ listId: BUGS }));

    expect(view).toMatchObject({ listId: BUGS, spaceId: PRODUIT, version: 13 });
    expect(tasks.stored(CAD_483)).toMatchObject({ listId: BUGS, version: 2 });
    expect(tasks.stored(CAD_484)).toMatchObject({ listId: BUGS, version: 2 });
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-482', version: 13, changed: ['listId'], actor: camille },
      { kind: 'updated', key: 'CAD-483', version: 2, changed: ['listId'], actor: camille },
      { kind: 'updated', key: 'CAD-484', version: 2, changed: ['listId'], actor: camille },
    ]);
    expect(tasks.activity.size).toBe(0);
  });

  it('names the space too when the list is in another space, and keeps a hidden status', async () => {
    const { tasks, useCase } = atelierNord([taskState({ status: 'testing' })]);

    const view = await useCase.execute(patchOf({ listId: CLOTURES }));

    expect(view).toMatchObject({ listId: CLOTURES, spaceId: ARCHIVES, status: 'testing' });
    expect(tasks.events[0]).toMatchObject({ changed: ['listId', 'spaceId'] });
  });

  it('checks a new status of the same patch against the space of the target list', async () => {
    const { useCase } = atelierNord();

    expect(
      await refusalOf(useCase.execute(patchOf({ listId: CLOTURES, status: 'testing' }))),
    ).toEqual({ reason: 'status-hidden', status: 'testing' });
  });

  it('moves nothing when the target is the current list', async () => {
    const { tasks, useCase } = atelierNord(tree());

    const view = await useCase.execute(patchOf({ listId: SPRINT_14 }));

    expect(view.version).toBe(12);
    expect(tasks.events).toEqual([]);
  });

  it('takes a subtask out of its parent when it moves to another list', async () => {
    const { tasks, useCase } = atelierNord(tree());

    const view = await useCase.execute(patchOf({ listId: BUGS }, { taskKey: 'CAD-483' }));

    expect(view).toMatchObject({ parentKey: null, listId: BUGS });
    expect(tasks.events[0]).toMatchObject({ key: 'CAD-483', changed: ['listId', 'parentKey'] });
    expect(tasks.stored(CAD_484)).toMatchObject({ listId: BUGS });
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it.each([
    ['an unknown list', UNKNOWN_LIST],
    ['a list of the private space of another member', MAQUETTES],
  ])('refuses %s as list-invalid', async (_name, listId) => {
    const { tasks, useCase } = atelierNord(tree());

    expect(await refusalOf(useCase.execute(patchOf({ listId })))).toEqual({
      reason: 'list-invalid',
    });
    expect(tasks.stored(CAD_482).version).toBe(12);
  });
});

describe('UpdateTask: attaching and detaching a subtask', () => {
  it('attaches a task to a parent of its list and leaves the parent unchanged', async () => {
    const { tasks, useCase } = atelierNord([taskState(), cad490State()]);

    const view = await useCase.execute(patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }));

    expect(view).toMatchObject({ parentKey: 'CAD-482', version: 2 });
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-490', version: 2, changed: ['parentKey'], actor: camille },
    ]);
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it('brings the task and its subtree to the list of its new parent', async () => {
    const { tasks, useCase } = atelierNord([
      ...tree(),
      cad490State({ listId: BUGS }),
      subtaskState({
        id: '019a7200-0000-7000-8000-000000000491',
        key: TaskKey.of('CAD', 491),
        parentId: CAD_490,
        parentKey: TaskKey.of('CAD', 490),
        listId: BUGS,
      }),
    ]);

    const view = await useCase.execute(patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }));

    expect(view).toMatchObject({ listId: SPRINT_14, parentKey: 'CAD-482' });
    expect(tasks.events.map((event) => [event.key, event.kind])).toEqual([
      ['CAD-490', 'updated'],
      ['CAD-491', 'updated'],
    ]);
    expect(tasks.stored('019a7200-0000-7000-8000-000000000491').listId).toBe(SPRINT_14);
  });

  it('detaches a subtask and keeps its list', async () => {
    const { tasks, useCase } = atelierNord(tree());

    const view = await useCase.execute(patchOf({ parentKey: null }, { taskKey: 'CAD-483' }));

    expect(view).toMatchObject({ parentKey: null, listId: SPRINT_14 });
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-483', version: 2, changed: ['parentKey'], actor: camille },
    ]);
  });

  it('locks the task and parent together before locking placements', async () => {
    const acquisitions: string[][] = [];
    const { tasks, useCase } = racing([taskState(), cad490State()], (repository) => ({
      ...repository,
      lockByIds: async (organizationId, ids, withChecklists) => {
        acquisitions.push([...ids]);
        return repository.lockByIds(organizationId, ids, withChecklists);
      },
    }));

    await useCase.execute(patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }));

    expect(tasks.trace).not.toContain('tasks.findByKey:lock');
    expect(acquisitions).toHaveLength(1);
    expect(acquisitions[0]?.sort()).toEqual([CAD_482, CAD_490].sort());
    expect(tasks.trace.indexOf('tasks.lockByIds')).toBeLessThan(
      tasks.trace.indexOf('spaces.lockTrashLists'),
    );
  });

  it.each([
    ['a task that is one of its own descendants', 'CAD-483', 'CAD-482'],
    ['an unknown task', 'CAD-999', 'CAD-490'],
    ['a task that is not a task key', 'nonsense', 'CAD-490'],
  ])('refuses %s as the parent with parent-invalid', async (_name, parentKey, taskKey) => {
    const { useCase } = atelierNord([...tree(), cad490State()]);

    expect(await refusalOf(useCase.execute(patchOf({ parentKey }, { taskKey })))).toEqual({
      reason: 'parent-invalid',
      parentKey,
    });
  });

  it('refuses a parent in the private space of another member as parent-invalid', async () => {
    const { useCase } = atelierNord([
      taskState(),
      taskState({
        id: '019a7200-0000-7000-8000-000000000501',
        key: TaskKey.of('DES', 1),
        listId: MAQUETTES,
        spaceId: DESIGN,
      }),
    ]);

    expect(
      await refusalOf(useCase.execute(patchOf({ parentKey: 'DES-1' }, { taskKey: 'CAD-482' }))),
    ).toEqual({ reason: 'parent-invalid', parentKey: 'DES-1' });
  });

  it('refuses a parent task itself as parent-invalid', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(patchOf({ parentKey: 'CAD-482' })))).toEqual({
      reason: 'parent-invalid',
      parentKey: 'CAD-482',
    });
  });

  it('refuses a list that is not the one of the new parent as list-invalid', async () => {
    const { useCase } = atelierNord([taskState(), cad490State()]);

    expect(
      await refusalOf(
        useCase.execute(patchOf({ parentKey: 'CAD-482', listId: BUGS }, { taskKey: 'CAD-490' })),
      ),
    ).toEqual({ reason: 'list-invalid' });
  });

  it('refuses a parent that would make the tree deeper than 3 levels', async () => {
    const { useCase } = atelierNord([...tree(), cad490State()]);

    expect(
      await refusalOf(useCase.execute(patchOf({ parentKey: 'CAD-484' }, { taskKey: 'CAD-490' }))),
    ).toEqual({ reason: 'subtask-depth-exceeded' });
  });

  it('refuses a 26th direct subtask', async () => {
    const children = Array.from({ length: 25 }, (_, index) =>
      subtaskState({
        id: `019a7200-0000-7000-8000-${String(900 + index).padStart(12, '0')}`,
        key: TaskKey.of('CAD', 600 + index),
      }),
    );
    const { useCase } = atelierNord([taskState(), cad490State(), ...children]);

    expect(
      await refusalOf(useCase.execute(patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }))),
    ).toEqual({ reason: 'subtask-limit-reached' });
  });
});

/**
 * Builds a use case over a fake store whose repository another request changes at a precise
 * moment, the way a concurrent transaction commits while this one waits for a lock.
 *
 * @param stored - The tasks.
 * @param decorate - Wraps the repository of the store; it receives the real one.
 * @returns The fake store and the use case.
 */
function racing(
  stored: readonly TaskState[],
  decorate: (repository: TasksStore['tasks']) => TasksStore['tasks'],
): { readonly tasks: InMemoryTasks; readonly useCase: UpdateTask } {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: stored, trace });
  const unitOfWork: TasksUnitOfWork = {
    run: (work) => tasks.run((store) => work({ ...store, tasks: decorate(store.tasks) })),
    runReadOnly: (work, options) => tasks.runReadOnly(work, options),
  };
  return {
    tasks,
    useCase: new UpdateTask(
      unitOfWork,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    ),
  };
}

describe('UpdateTask: the visibility is checked again when the lock shows another list', () => {
  /**
   * Shows CAD-482 in another list once it is locked, as if another request moved it meanwhile.
   *
   * @param listId - The list the locked task is in.
   * @param spaceId - Its space.
   * @returns The decorator of the repository.
   */
  function movedAtLock(listId: string, spaceId: string) {
    return (repository: TasksStore['tasks']): TasksStore['tasks'] => ({
      ...repository,
      findByKey: async (organizationId, key, lock) => {
        const found = await repository.findByKey(organizationId, key, lock);
        return lock && found !== null
          ? Task.restore({ ...found.snapshot, listId, spaceId })
          : found;
      },
    });
  }

  it('answers task-not-found when the locked task is now in a space the actor does not see', async () => {
    const { tasks, useCase } = racing([taskState()], movedAtLock(MAQUETTES, DESIGN));

    expect(await refusalOf(useCase.execute(patchOf({ name: 'Refonte' })))).toEqual({
      reason: 'task-not-found',
    });
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it('decides the rules of the patch on the space the locked task is in', async () => {
    const { useCase } = racing([taskState()], movedAtLock(CLOTURES, ARCHIVES));

    expect(await refusalOf(useCase.execute(patchOf({ status: 'testing' })))).toEqual({
      reason: 'status-hidden',
      status: 'testing',
    });
  });

  it('checks the visibility of the list once when the task did not move', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: [taskState()], trace });
    const spaces = new InMemorySpaceDirectory({ trace });

    await new UpdateTask(tasks, atelierNordMembers([], trace), spaces).execute(
      patchOf({ name: 'Refonte' }),
    );

    expect(spaces.findCalls).toEqual([SPRINT_14]);
  });
});

describe('UpdateTask: the parent to attach to is checked on the list it is in once locked', () => {
  it('refuses a proposed parent erased before its ordered lock', async () => {
    let erased = false;
    const { tasks, useCase } = racing([taskState(), cad490State()], (repository) => ({
      ...repository,
      findByKey: (organizationId, key, locked) =>
        erased && key.format() === 'CAD-482'
          ? Promise.resolve(null)
          : repository.findByKey(organizationId, key, locked),
      lockByIds: async (organizationId, ids, withChecklists) => {
        erased = true;
        return repository.lockByIds(
          organizationId,
          ids.filter((id) => id !== CAD_482),
          withChecklists,
        );
      },
    }));

    expect(
      await refusalOf(useCase.execute(patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }))),
    ).toEqual({
      reason: 'parent-invalid',
      parentKey: 'CAD-482',
    });
    expect(tasks.stored(CAD_490).parentId).toBeNull();
  });

  /**
   * Shows CAD-482 in another list once it is locked as a parent.
   *
   * @param listId - The list the locked parent is in.
   * @param spaceId - Its space.
   * @returns The decorator of the repository.
   */
  function parentMovedAtLock(listId: string, spaceId: string) {
    return (repository: TasksStore['tasks']): TasksStore['tasks'] => ({
      ...repository,
      lockByIds: async (organizationId, ids) =>
        (await repository.lockByIds(organizationId, ids)).map((task) =>
          task.snapshot.id === CAD_482 ? Task.restore({ ...task.snapshot, listId, spaceId }) : task,
        ),
    });
  }

  it('refuses a parent that is now in the private space of another member as parent-invalid', async () => {
    const { useCase } = racing([taskState(), cad490State()], parentMovedAtLock(MAQUETTES, DESIGN));

    expect(
      await refusalOf(useCase.execute(patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }))),
    ).toEqual({ reason: 'parent-invalid', parentKey: 'CAD-482' });
  });

  it('checks a new status against the space the locked parent is in', async () => {
    const { useCase } = racing([taskState(), cad490State()], parentMovedAtLock(CLOTURES, ARCHIVES));

    expect(
      await refusalOf(
        useCase.execute(
          patchOf({ parentKey: 'CAD-482', status: 'testing' }, { taskKey: 'CAD-490' }),
        ),
      ),
    ).toEqual({ reason: 'status-hidden', status: 'testing' });
  });
});

describe('UpdateTask: a move carries only the tasks that are still descendants once locked', () => {
  const lateChild = subtaskState({
    id: '019a7200-0000-7000-8000-000000000495',
    key: TaskKey.of('CAD', 495),
    parentId: CAD_483,
    parentKey: TaskKey.of('CAD', 483),
  });

  it('leaves a descendant that another request detached before the lock was granted', async () => {
    let first = true;
    const { tasks, useCase } = racing(tree(), (repository) => ({
      ...repository,
      lockByIds: async (organizationId, ids) => {
        const locked = await repository.lockByIds(organizationId, ids);
        const grandchildTask = locked.find((task) => task.snapshot.id === CAD_484);
        if (first && grandchildTask !== undefined) {
          first = false;
          await repository.save(
            grandchildTask,
            Task.restore({
              ...grandchildTask.snapshot,
              parentId: null,
              parentKey: null,
              version: 2,
            }),
          );
        }
        return locked;
      },
    }));

    await useCase.execute(patchOf({ listId: BUGS }));

    expect(tasks.stored(CAD_484)).toMatchObject({ listId: SPRINT_14, parentId: null, version: 2 });
    expect(tasks.stored(CAD_483)).toMatchObject({ listId: BUGS, version: 2 });
    expect(tasks.events.map((event) => event.key)).toEqual(['CAD-482', 'CAD-483']);
  });

  it('also locks and moves a descendant that appeared while the first ones were locked', async () => {
    let first = true;
    const { tasks, useCase } = racing(tree(), (repository) => ({
      ...repository,
      lockByIds: async (organizationId, ids) => {
        const locked = await repository.lockByIds(organizationId, ids);
        if (first) {
          first = false;
          await repository.insert(lateChild, TaskKey.of('CAD', 495));
        }
        return locked;
      },
    }));

    await useCase.execute(patchOf({ listId: BUGS }));

    expect(tasks.events.map((event) => event.key).sort()).toEqual([
      'CAD-482',
      'CAD-483',
      'CAD-484',
      'CAD-495',
    ]);
    expect([...tasks.tasks.values()].every((row) => row.listId === BUGS)).toBe(true);
  });

  it('refuses to lock a subtree larger than a valid tree can be', async () => {
    const crowd = Array.from({ length: 651 }, (_, index) =>
      subtaskState({
        id: `019a7200-0000-7000-8000-${String(10_000 + index).padStart(12, '0')}`,
        key: TaskKey.of('CAD', 1000 + index),
      }),
    );
    const { tasks, useCase } = atelierNord([taskState(), ...crowd]);

    await expect(useCase.execute(patchOf({ listId: BUGS }))).rejects.toThrow('descendants');
    expect(tasks.stored(CAD_482).listId).toBe(SPRINT_14);
  });
});

/**
 * Builds the spaces of Atelier Nord with "Bugs" closed to the organization (its switch off) and
 * shared with some accounts; "Sprint 14" stays open to every member.
 *
 * @param grants - The role of each account Bugs is shared with.
 * @returns The fake spaces.
 */
function bugsSharedWith(grants: Readonly<Record<string, 'edit' | 'comment' | 'view'>>) {
  return new InMemorySpaceDirectory({
    lists: atelierNordLists().map((list) =>
      list.id === BUGS ? { ...list, organizationAccess: false } : list,
    ),
    listGrants: { [BUGS]: grants },
  });
}

/**
 * Builds the use case over a store and some spaces.
 *
 * @param stored - The tasks.
 * @param spaces - The fake spaces.
 * @returns The fake store and the use case.
 */
function over(
  stored: readonly TaskState[],
  spaces: InMemorySpaceDirectory,
): { readonly tasks: InMemoryTasks; readonly useCase: UpdateTask } {
  const tasks = new InMemoryTasks({ tasks: stored });
  return { tasks, useCase: new UpdateTask(tasks, atelierNordMembers(), spaces) };
}

describe('UpdateTask: a change needs edit on the list of the task', () => {
  it.each(['view', 'comment'] as const)(
    'refuses a member with %s on Sprint 14 as role-insufficient, changing nothing',
    async (role) => {
      const { tasks, useCase } = over([taskState()], sprint14SharedWith({ [HUGO]: role }));

      expect(
        await refusalOf(useCase.execute(patchOf({ status: 'review' }, { actorUserId: HUGO }))),
      ).toEqual({ reason: 'role-insufficient', role });
      expect(tasks.stored(CAD_482)).toMatchObject({ status: 'progress', version: 12 });
      expect(tasks.events).toEqual([]);
      expect(tasks.activity.size).toBe(0);
    },
  );

  it('answers task-not-found before role-insufficient, and role-insufficient before If-Match', async () => {
    const { useCase } = over([taskState()], sprint14SharedWith({ [HUGO]: 'view' }));

    expect(
      await refusalOf(useCase.execute(patchOf({ status: 'review' }, { actorUserId: LEA }))),
    ).toEqual({ reason: 'task-not-found' });
    expect(
      await refusalOf(
        useCase.execute(
          patchOf({ status: 'review' }, { actorUserId: HUGO, expectedVersions: [3] }),
        ),
      ),
    ).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('refuses even a patch that would change nothing', async () => {
    const { useCase } = over([taskState()], sprint14SharedWith({ [HUGO]: 'comment' }));

    expect(await refusalOf(useCase.execute(patchOf({}, { actorUserId: HUGO })))).toEqual({
      reason: 'role-insufficient',
      role: 'comment',
    });
  });

  it('lets a guest with edit on the list change the status of its task', async () => {
    const { tasks, useCase } = over([taskState()], sprint14SharedWith({ [NADIA]: 'edit' }));

    const view = await useCase.execute(patchOf({ status: 'review' }, { actorUserId: NADIA }));

    expect(view).toMatchObject({ status: 'review', version: 13 });
    expect(tasks.events[0]).toMatchObject({ actor: { type: 'user', id: NADIA } });
  });

  it('keeps every member at edit on a list of the organization, the rule before grants', async () => {
    const { useCase } = over([taskState()], new InMemorySpaceDirectory());

    expect(
      (await useCase.execute(patchOf({ status: 'review' }, { actorUserId: LEA }))).version,
    ).toBe(13);
  });
});

describe('UpdateTask: a move needs edit on the list it goes to', () => {
  it.each(['view', 'comment'] as const)(
    'refuses a move to a list the actor sees with %s as role-insufficient, moving nothing',
    async (role) => {
      const { tasks, useCase } = over(tree(), bugsSharedWith({ [HUGO]: role }));

      expect(
        await refusalOf(useCase.execute(patchOf({ listId: BUGS }, { actorUserId: HUGO }))),
      ).toEqual({ reason: 'role-insufficient', role });
      expect(tasks.stored(CAD_482)).toMatchObject({ listId: SPRINT_14, version: 12 });
      expect(tasks.stored(CAD_483)).toMatchObject({ listId: SPRINT_14 });
      expect(tasks.events).toEqual([]);
    },
  );

  it('keeps list-invalid for a list the actor has no role on', async () => {
    const { useCase } = over(tree(), bugsSharedWith({}));

    expect(
      await refusalOf(useCase.execute(patchOf({ listId: BUGS }, { actorUserId: HUGO }))),
    ).toEqual({ reason: 'list-invalid' });
  });

  it('checks If-Match before the role on the list it goes to', async () => {
    const { useCase } = over(tree(), bugsSharedWith({ [HUGO]: 'view' }));

    expect(
      await refusalOf(
        useCase.execute(patchOf({ listId: BUGS }, { actorUserId: HUGO, expectedVersions: [3] })),
      ),
    ).toEqual({ reason: 'version-mismatch', version: 12 });
  });

  it('moves the task and its subtree to a list the actor has edit on', async () => {
    const { tasks, useCase } = over(tree(), bugsSharedWith({ [HUGO]: 'edit' }));

    const view = await useCase.execute(patchOf({ listId: BUGS }, { actorUserId: HUGO }));

    expect(view).toMatchObject({ listId: BUGS, version: 13 });
    expect(tasks.stored(CAD_484)).toMatchObject({ listId: BUGS });
  });
});

describe('UpdateTask: an attachment needs edit on the list of the new parent', () => {
  it.each(['view', 'comment'] as const)(
    'refuses a parent in a list the actor sees with %s as role-insufficient',
    async (role) => {
      const { tasks, useCase } = over(
        [taskState({ listId: BUGS }), cad490State()],
        bugsSharedWith({ [HUGO]: role }),
      );

      expect(
        await refusalOf(
          useCase.execute(
            patchOf({ parentKey: 'CAD-482' }, { actorUserId: HUGO, taskKey: 'CAD-490' }),
          ),
        ),
      ).toEqual({ reason: 'role-insufficient', role });
      expect(tasks.stored(CAD_490)).toMatchObject({ parentId: null, listId: SPRINT_14 });
    },
  );

  it('keeps parent-invalid for a parent in a list the actor has no role on', async () => {
    const { useCase } = over([taskState({ listId: BUGS }), cad490State()], bugsSharedWith({}));

    expect(
      await refusalOf(
        useCase.execute(
          patchOf({ parentKey: 'CAD-482' }, { actorUserId: HUGO, taskKey: 'CAD-490' }),
        ),
      ),
    ).toEqual({ reason: 'parent-invalid', parentKey: 'CAD-482' });
  });

  it('attaches the task to a parent of its own list with edit on that list only', async () => {
    const { useCase } = over(
      [taskState({ listId: BUGS }), cad490State({ listId: BUGS })],
      bugsSharedWith({ [HUGO]: 'edit' }),
    );

    const view = await useCase.execute(
      patchOf({ parentKey: 'CAD-482' }, { actorUserId: HUGO, taskKey: 'CAD-490' }),
    );

    expect(view).toMatchObject({ parentKey: 'CAD-482', listId: BUGS });
  });

  it('moves the task to the list of a parent the actor has edit on', async () => {
    const { useCase } = over(
      [taskState({ listId: BUGS }), cad490State()],
      bugsSharedWith({ [HUGO]: 'edit' }),
    );

    const view = await useCase.execute(
      patchOf({ parentKey: 'CAD-482' }, { actorUserId: HUGO, taskKey: 'CAD-490' }),
    );

    expect(view).toMatchObject({ parentKey: 'CAD-482', listId: BUGS });
  });

  it('decides the role on the list the locked parent is in', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState(), cad490State()] });
    const unitOfWork: TasksUnitOfWork = {
      run: (work) =>
        tasks.run((store) =>
          work({
            ...store,
            tasks: {
              ...store.tasks,
              lockByIds: async (organizationId, ids) =>
                (await store.tasks.lockByIds(organizationId, ids)).map((task) =>
                  task.snapshot.id === CAD_482
                    ? Task.restore({ ...task.snapshot, listId: BUGS })
                    : task,
                ),
            },
          }),
        ),
      runReadOnly: (work, options) => tasks.runReadOnly(work, options),
    };
    const useCase = new UpdateTask(
      unitOfWork,
      atelierNordMembers(),
      bugsSharedWith({ [HUGO]: 'comment' }),
    );

    expect(
      await refusalOf(
        useCase.execute(
          patchOf({ parentKey: 'CAD-482' }, { actorUserId: HUGO, taskKey: 'CAD-490' }),
        ),
      ),
    ).toEqual({ reason: 'role-insufficient', role: 'comment' });
  });
});

describe('UpdateTask: an archived task refuses every patch with task-archived', () => {
  it.each<[string, UpdateTaskInput['patch']]>([
    ['a rename', { name: 'Autre' }],
    ['a patch that changes nothing', {}],
    ['a move', { listId: BUGS }],
    ['a detachment with parentKey null', { parentKey: null }],
    ['an attachment to a live parent', { parentKey: 'CAD-490' }],
  ])(
    'refuses %s with its key before a stale If-Match, and writes nothing',
    async (_case, patch) => {
      const { tasks, useCase } = atelierNord([
        taskState({ archive: archiveFrom(CAD_482) }),
        cad490State(),
      ]);

      expect(await refusalOf(useCase.execute(patchOf(patch, { expectedVersions: [3] })))).toEqual({
        reason: 'task-archived',
        key: 'CAD-482',
      });
      expect(tasks.stored(CAD_482)).toEqual(taskState({ archive: archiveFrom(CAD_482) }));
      expect(tasks.events).toEqual([]);
    },
  );

  it('answers role-insufficient before task-archived', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] });
    const useCase = new UpdateTask(
      tasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'view' }),
    );

    expect(
      await refusalOf(useCase.execute(patchOf({ name: 'Autre' }, { actorUserId: HUGO }))),
    ).toEqual({ reason: 'role-insufficient', role: 'view' });
  });
});

describe('UpdateTask: the trash and the deleted lists in a move or an attachment', () => {
  it('refuses a parent in the trash as parent-invalid, an unseen parent, whoever may restore it', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState({ trash: trashIn(), version: 13 }), cad490State()],
      trashEntries: [storedEntry({ taskCount: 1 })],
    });

    expect(
      await refusalOf(
        new UpdateTask(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute(
          patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }),
        ),
      ),
    ).toEqual({ reason: 'parent-invalid', parentKey: 'CAD-482' });
    expect(tasks.stored(CAD_490).parentId).toBeNull();
  });

  it('refuses a deleted target list as list-invalid, as an unseen one', async () => {
    const tasks = new InMemoryTasks({ tasks: tree() });
    const spaces = new InMemorySpaceDirectory({
      deletedLists: { [BUGS]: { type: 'user', id: CAMILLE } },
    });

    expect(
      await refusalOf(
        new UpdateTask(tasks, atelierNordMembers(), spaces).execute(patchOf({ listId: BUGS })),
      ),
    ).toEqual({ reason: 'list-invalid' });
  });

  /**
   * A directory that sees the lists live, then one of them deleted under the hold of the change.
   */
  class DeletedUnderHold extends InMemorySpaceDirectory {
    // #region Properties
    /** The list the hold answers deleted. */
    private readonly deletedOnHold: string;
    // #endregion

    // #region Constructor
    /**
     * Builds the directory.
     *
     * @param deletedOnHold - The list the hold answers deleted.
     */
    public constructor(deletedOnHold: string) {
      super();
      this.deletedOnHold = deletedOnHold;
    }
    // #endregion

    // #region Methods
    /**
     * Records the lock and answers the named list as deleted.
     *
     * @param args - The organization, lists, lock mode and acting member.
     * @returns The locked lists with the named list marked deleted.
     */
    public override async lockTrashLists(
      ...args: Parameters<InMemorySpaceDirectory['lockTrashLists']>
    ): ReturnType<InMemorySpaceDirectory['lockTrashLists']> {
      const lists = await super.lockTrashLists(...args);
      return lists.map((list) =>
        list.listId === this.deletedOnHold ? { ...list, outcome: 'deleted' as const } : list,
      );
    }
    // #endregion
  }

  it('holds the target list once the tree is locked, and refuses it deleted meanwhile', async () => {
    const tasks = new InMemoryTasks({ tasks: tree() });
    const spaces = new DeletedUnderHold(BUGS);

    expect(
      await refusalOf(
        new UpdateTask(tasks, atelierNordMembers(), spaces).execute(patchOf({ listId: BUGS })),
      ),
    ).toEqual({ reason: 'list-invalid' });
    expect(spaces.lockTrashCalls[0]?.listIds).toEqual([SPRINT_14, BUGS]);
    expect(tasks.stored(CAD_482).listId).toBe(SPRINT_14);
  });

  it('holds the list a move leaves, and answers task-not-found when it was deleted meanwhile', async () => {
    const tasks = new InMemoryTasks({ tasks: tree() });
    const spaces = new DeletedUnderHold(SPRINT_14);

    expect(
      await refusalOf(
        new UpdateTask(tasks, atelierNordMembers(), spaces).execute(patchOf({ listId: BUGS })),
      ),
    ).toEqual({ reason: 'task-not-found' });
    expect(spaces.lockTrashCalls[0]?.listIds).toEqual([SPRINT_14, BUGS]);
    expect(tasks.stored(CAD_482).listId).toBe(SPRINT_14);
  });

  it('holds the list an attachment to a parent of another list leaves', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState({ listId: BUGS }), cad490State()],
    });
    const spaces = new DeletedUnderHold(SPRINT_14);

    expect(
      await refusalOf(
        new UpdateTask(tasks, atelierNordMembers(), spaces).execute(
          patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }),
        ),
      ),
    ).toEqual({ reason: 'task-not-found' });
    expect(spaces.lockTrashCalls[0]?.listIds).toEqual([SPRINT_14, BUGS]);
    expect(tasks.stored(CAD_490).parentId).toBeNull();
  });

  it('holds the list it leaves, then the target of a move, after the locks of the task and its subtree', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: tree(), trace });
    const spaces = new InMemorySpaceDirectory({ trace });

    await new UpdateTask(tasks, atelierNordMembers([], trace), spaces).execute(
      patchOf({ listId: BUGS }),
    );

    expect(trace.indexOf('spaces.lockTrashLists')).toBeGreaterThan(
      trace.lastIndexOf('tasks.lockByIds'),
    );
    expect(spaces.lockTrashCalls[0]?.listIds).toEqual([SPRINT_14, BUGS]);
  });

  it('hands both lists to the shared lock operation whichever list the move leaves', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ listId: BUGS })] });
    const spaces = new DeletedUnderHold(BUGS);

    expect(
      await refusalOf(
        new UpdateTask(tasks, atelierNordMembers(), spaces).execute(patchOf({ listId: SPRINT_14 })),
      ),
    ).toEqual({ reason: 'task-not-found' });
    expect(spaces.lockTrashCalls[0]?.listIds).toEqual([BUGS, SPRINT_14]);
    expect(tasks.stored(CAD_482).listId).toBe(BUGS);
  });

  it('holds no list for a change within the list', async () => {
    const tasks = new InMemoryTasks({ tasks: tree() });
    const spaces = new InMemorySpaceDirectory();

    await new UpdateTask(tasks, atelierNordMembers(), spaces).execute(
      patchOf({ name: 'Écran SSO' }),
    );

    expect(spaces.holdCalls).toEqual([]);
    expect(spaces.lockTrashCalls).toEqual([]);
  });

  it('leaves the trash out of the subtree a move takes', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState(), subtaskState({ trash: trashIn(), version: 2 })],
      trashEntries: [storedEntry({ rootTaskId: CAD_483, taskCount: 1, parentKey: 'CAD-482' })],
    });

    await new UpdateTask(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute(
      patchOf({ listId: BUGS }),
    );

    expect(tasks.stored(CAD_482).listId).toBe(BUGS);
    expect(tasks.stored(CAD_483)).toMatchObject({ listId: SPRINT_14, version: 2 });
  });
});

describe('UpdateTask: an archived parent takes no attached task', () => {
  /**
   * Attaches CAD-490 to CAD-482 by Hugo Dubois.
   *
   * @param stored - The tasks.
   * @param spaces - The fake spaces.
   * @returns The refusal.
   */
  async function attach(
    stored: readonly TaskState[],
    spaces: InMemorySpaceDirectory = new InMemorySpaceDirectory(),
  ): ReturnType<typeof refusalOf> {
    const tasks = new InMemoryTasks({ tasks: stored });
    return refusalOf(
      new UpdateTask(tasks, atelierNordMembers(), spaces).execute(
        patchOf({ parentKey: 'CAD-482' }, { actorUserId: HUGO, taskKey: 'CAD-490' }),
      ),
    );
  }

  /**
   * Builds the spaces with "Bugs" closed to the organization and shared with some accounts.
   *
   * @param grants - The role of each account on "Bugs".
   * @returns The fake spaces.
   */
  function bugsSharedWith(
    grants: Readonly<Record<string, 'view' | 'comment' | 'edit'>>,
  ): InMemorySpaceDirectory {
    return new InMemorySpaceDirectory({
      lists: atelierNordLists().map((list) =>
        list.id === BUGS ? { ...list, organizationAccess: false } : list,
      ),
      listGrants: { [BUGS]: grants },
    });
  }

  it('refuses an attachment to an archived parent with the key of the parent', async () => {
    expect(await attach([taskState({ archive: archiveFrom(CAD_482) }), cad490State()])).toEqual({
      reason: 'task-archived',
      key: 'CAD-482',
    });
  });

  it('answers the 422 of an unseen parent, then the 403 of its list, before task-archived', async () => {
    const inBugs: readonly TaskState[] = [
      taskState({ listId: BUGS, archive: archiveFrom(CAD_482) }),
      cad490State(),
    ];

    expect(await attach(inBugs, bugsSharedWith({}))).toEqual({
      reason: 'parent-invalid',
      parentKey: 'CAD-482',
    });
    expect(await attach(inBugs, bugsSharedWith({ [HUGO]: 'view' }))).toEqual({
      reason: 'role-insufficient',
      role: 'view',
    });
  });

  it('answers task-archived before the rules of the tree', async () => {
    const atThirdLevel: readonly TaskState[] = [
      taskState({
        parentId: CAD_483,
        parentKey: TaskKey.of('CAD', 483),
        archive: archiveFrom(CAD_482),
      }),
      subtaskState({
        parentId: CAD_484,
        parentKey: TaskKey.of('CAD', 484),
        archive: archiveFrom(CAD_484),
      }),
      subtaskState({
        id: CAD_484,
        key: TaskKey.of('CAD', 484),
        parentId: null,
        parentKey: null,
        archive: archiveFrom(CAD_484),
      }),
      cad490State(),
    ];

    expect(await attach(atThirdLevel)).toEqual({ reason: 'task-archived', key: 'CAD-482' });
  });
});

describe('UpdateTask: archived subtasks stay out of the live tree of a patch', () => {
  it('leaves an archived subtask in its list and under its parent when the parent moves', async () => {
    const { tasks, useCase } = atelierNord([
      taskState(),
      subtaskState({ archive: archiveFrom(CAD_483), version: 2 }),
    ]);

    await useCase.execute(patchOf({ listId: BUGS }));

    expect(tasks.stored(CAD_482).listId).toBe(BUGS);
    expect(tasks.stored(CAD_483)).toMatchObject({
      listId: SPRINT_14,
      parentId: CAD_482,
      version: 2,
    });
    expect(tasks.events.map((event) => event.key)).toEqual(['CAD-482']);
  });

  it('measures an attachment with the live subtree only', async () => {
    const archivedBelow = archiveFrom(CAD_483);
    const { tasks, useCase } = atelierNord([
      taskState(),
      cad490State(),
      subtaskState({
        parentId: CAD_490,
        parentKey: TaskKey.of('CAD', 490),
        archive: archivedBelow,
        version: 2,
      }),
      subtaskState({
        id: CAD_484,
        key: TaskKey.of('CAD', 484),
        parentId: CAD_483,
        parentKey: TaskKey.of('CAD', 483),
        archive: archivedBelow,
        version: 2,
      }),
    ]);

    const view = await useCase.execute(patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }));

    expect(view.parentKey).toBe('CAD-482');
    expect(tasks.stored(CAD_483)).toMatchObject({ parentId: CAD_490, version: 2 });
  });
});
