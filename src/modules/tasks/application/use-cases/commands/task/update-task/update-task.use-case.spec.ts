import { describe, expect, it } from 'vitest';

import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
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
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  MAQUETTES,
  NADIA,
  NOW,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  atelierNordMembers,
  cad490State,
  refusalOf,
  subtaskState,
  taskState,
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
      },
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
    ['any task, for a guest', { actorUserId: NADIA }],
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

  it('locks the task before the parent and the descendants', async () => {
    const { tasks, useCase } = atelierNord([taskState(), cad490State()]);

    await useCase.execute(patchOf({ parentKey: 'CAD-482' }, { taskKey: 'CAD-490' }));

    expect(tasks.trace.indexOf('tasks.findByKey:lock')).toBeLessThan(
      tasks.trace.indexOf('tasks.lockByIds'),
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
