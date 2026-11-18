import { describe, expect, it } from 'vitest';

import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import {
  ARCHIVES,
  ATELIER_NORD,
  CAD_482,
  CAD_483,
  CAD_484,
  CAMILLE,
  CLOTURES,
  DESIGN,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  MAQUETTES,
  NADIA,
  STRANGER,
  atelierNordMembers,
  refusalOf,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { CreateSubtaskInput } from './create-subtask.input.js';
import { CreateSubtask } from './create-subtask.use-case.js';

/**
 * Builds the creation of "Écrire les tests" under CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function createSubtask(overrides: Partial<CreateSubtaskInput> = {}): CreateSubtaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    name: 'Écrire les tests',
    description: null,
    status: 'todo',
    cancelReason: null,
    cancelNote: null,
    priority: 'moyenne',
    assigneeIds: null,
    dueDate: null,
    startDate: null,
    estimateMinutes: null,
    labels: [],
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord holding CAD-482 and the given tasks.
 *
 * @param more - The tasks stored besides CAD-482.
 * @param parent - What replaces CAD-482.
 * @returns The fakes and the use case.
 */
function atelierNord(
  more: Parameters<typeof taskState>[0][] = [],
  parent: Parameters<typeof taskState>[0] = {},
): {
  readonly tasks: InMemoryTasks;
  readonly useCase: CreateSubtask;
} {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({
    tasks: [taskState(parent), ...more.map((overrides) => taskState(overrides))],
    trace,
  });
  return {
    tasks,
    useCase: new CreateSubtask(
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    ),
  };
}

describe('CreateSubtask: a subtask takes the list of its parent and the next key', () => {
  it('creates the subtask under CAD-482 at version 1, in the list of its parent', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(createSubtask());

    expect(view).toMatchObject({
      key: 'CAD-496',
      parentKey: 'CAD-482',
      listId: taskState().listId,
      spaceId: taskState().spaceId,
      status: 'todo',
      version: 1,
    });
    expect(tasks.stored(view.id).parentId).toBe(CAD_482);
  });

  it('does not change the parent and emits nothing for it', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createSubtask());

    expect(tasks.stored(CAD_482).version).toBe(12);
    expect(tasks.events.map((event) => [event.kind, event.key])).toEqual([
      ['created', 'CAD-496'],
      ['assigned', 'CAD-496'],
    ]);
  });

  it('records the create entry of the subtask', async () => {
    const { tasks, useCase } = atelierNord();

    const view = await useCase.execute(createSubtask());

    expect(tasks.entriesOf(view.id).map((entry) => entry.change.kind)).toEqual(['create']);
  });

  it('takes the first assignee of the parent when the request names none', async () => {
    const { useCase } = atelierNord();

    const view = await useCase.execute(createSubtask({ assigneeIds: null }));

    expect(view.assigneeIds).toEqual([CAMILLE]);
  });

  it('takes the assignees of the request, an empty list meaning none', async () => {
    const { useCase } = atelierNord();

    expect((await useCase.execute(createSubtask({ assigneeIds: [HUGO] }))).assigneeIds).toEqual([
      HUGO,
    ]);
    expect((await useCase.execute(createSubtask({ assigneeIds: [] }))).assigneeIds).toEqual([]);
  });

  it('creates the subtask without assignee when the first assignee of the parent is a guest', async () => {
    const { useCase } = atelierNord([], { assigneeIds: [NADIA, INES] });

    const view = await useCase.execute(createSubtask());

    expect(view.assigneeIds).toEqual([]);
  });

  it('creates the subtask without assignee when the parent has none', async () => {
    const { useCase } = atelierNord([], { assigneeIds: [] });

    expect((await useCase.execute(createSubtask())).assigneeIds).toEqual([]);
  });

  it('locks the actor, then the inherited assignee, then the parent, and allocates last', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(createSubtask());

    expect(tasks.trace).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      'tasks.findByKey:read',
      'spaces.findVisibleList',
      `members.roleOf:${CAMILLE}:lock`,
      'tasks.findByKey:read',
      'spaces.findVisibleList',
      'tasks.findByKey:lock',
      'spaces.allocateKeys',
      'tasks.insert',
      'events.created',
    ]);
  });
});

/**
 * Builds a use case on Atelier Nord, holding CAD-482 assigned to Camille Martin, whose parent is
 * found with other assignees once it is locked, as if another request reassigned it in between.
 *
 * @param assigneesAtLock - The assignees of the parent when it is read under its lock.
 * @returns The fake and the use case.
 */
function reassignedAtLock(assigneesAtLock: readonly string[]): {
  readonly tasks: InMemoryTasks;
  readonly useCase: CreateSubtask;
} {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: [taskState()], trace });
  const racing: TasksUnitOfWork = {
    run: (work) =>
      tasks.run((store) =>
        work({
          ...store,
          tasks: {
            ...store.tasks,
            findByKey: async (organizationId, key, lock) => {
              const found = await store.tasks.findByKey(organizationId, key, lock);
              return lock && found !== null
                ? Task.restore({ ...found.snapshot, assigneeIds: assigneesAtLock })
                : found;
            },
          },
        }),
      ),
    runReadOnly: (work, options) => tasks.runReadOnly(work, options),
  };
  return {
    tasks,
    useCase: new CreateSubtask(
      racing,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    ),
  };
}

describe('CreateSubtask: a parent reassigned between the read of its assignee and its lock', () => {
  it('keeps the account that was read while it is still assigned, and locks no membership under the parent lock', async () => {
    const { tasks, useCase } = reassignedAtLock([HUGO, CAMILLE]);

    const view = await useCase.execute(createSubtask({ assigneeIds: null }));

    expect(view.assigneeIds).toEqual([CAMILLE]);
    const afterLock = tasks.trace.slice(tasks.trace.indexOf('tasks.findByKey:lock'));
    expect(afterLock.filter((call) => call.startsWith('members.'))).toEqual([]);
  });

  it('creates the subtask without assignee when the account that was read left the parent', async () => {
    const { tasks, useCase } = reassignedAtLock([HUGO]);

    const view = await useCase.execute(createSubtask({ assigneeIds: null }));

    expect(view.assigneeIds).toEqual([]);
    const afterLock = tasks.trace.slice(tasks.trace.indexOf('tasks.findByKey:lock'));
    expect(afterLock.filter((call) => call.startsWith('members.'))).toEqual([]);
  });
});

describe('CreateSubtask: the tree rules of the domain', () => {
  it('refuses a subtask under a task of the third level with subtask-depth-exceeded', async () => {
    const { tasks, useCase } = atelierNord([
      subtaskState(),
      subtaskState({
        id: CAD_484,
        key: TaskKey.of('CAD', 484),
        parentId: CAD_483,
        parentKey: TaskKey.of('CAD', 483),
      }),
    ]);

    expect(await refusalOf(useCase.execute(createSubtask({ taskKey: 'CAD-484' })))).toEqual({
      reason: 'subtask-depth-exceeded',
    });
    expect(tasks.tasks.size).toBe(3);
  });

  it('refuses the 26th direct subtask with subtask-limit-reached', async () => {
    const children = Array.from({ length: 25 }, (_, index) =>
      subtaskState({
        id: `019a7200-0000-7000-8000-${String(900 + index).padStart(12, '0')}`,
        key: TaskKey.of('CAD', 600 + index),
      }),
    );
    const { useCase } = atelierNord(children);

    expect(await refusalOf(useCase.execute(createSubtask()))).toEqual({
      reason: 'subtask-limit-reached',
    });
  });

  it('refuses a status that the space of the parent no longer uses', async () => {
    const { useCase } = atelierNord([], { listId: CLOTURES, spaceId: ARCHIVES });

    expect(await refusalOf(useCase.execute(createSubtask({ status: 'testing' })))).toEqual({
      reason: 'status-hidden',
      status: 'testing',
    });
  });

  it('refuses a guest as assignee, naming it', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createSubtask({ assigneeIds: [NADIA] })))).toEqual({
      reason: 'assignee-invalid',
      userIds: [NADIA],
    });
  });

  it('refuses a cancelled subtask without a reason', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createSubtask({ status: 'cancelled' })))).toEqual({
      reason: 'cancel-reason-required',
    });
  });
});

describe('CreateSubtask: what the actor does not see is not found', () => {
  it.each([
    ['an unknown parent', { taskKey: 'CAD-999' }],
    ['any parent, for a guest', { actorUserId: NADIA }],
  ] as const)('refuses %s', async (_name, overrides) => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createSubtask(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses a parent whose list is in the private space of another member', async () => {
    const { useCase } = atelierNord([], { listId: MAQUETTES, spaceId: DESIGN });

    expect(await refusalOf(useCase.execute(createSubtask({ actorUserId: INES })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    const { useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(createSubtask({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});
