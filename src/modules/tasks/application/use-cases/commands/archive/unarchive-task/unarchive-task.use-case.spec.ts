import { describe, expect, it } from 'vitest';

import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { TaskArchive } from '../../../../../domain/value-objects/task/task-archive.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { ListRestoration } from '../../../../models/placement/list-restoration.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_483,
  CAD_484,
  CAD_490,
  CAMILLE,
  HUGO,
  HUGO_ACTOR,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  NOW,
  SPRINT_14,
  archiveFrom,
  atelierNordLists,
  atelierNordMembers,
  cad490State,
  queryTask,
  refusalOf,
  sprint14SharedWith,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { UnarchiveTaskInput } from './unarchive-task.input.js';
import { UnarchiveTask } from './unarchive-task.use-case.js';

/** The archive made from CAD-482. */
const FROM_482: TaskArchive = archiveFrom(CAD_482);

/** The archive made from CAD-483, the subtask of CAD-482. */
const FROM_483: TaskArchive = archiveFrom(CAD_483);

/** CAD-484, a subtask of CAD-483, itself a subtask of CAD-482. */
function grandchild(overrides: Partial<TaskState> = {}): TaskState {
  return subtaskState({
    id: CAD_484,
    key: TaskKey.of('CAD', 484),
    parentId: CAD_483,
    parentKey: TaskKey.of('CAD', 483),
    name: 'Libellé du bouton',
    ...overrides,
  });
}

/** CAD-482 archived with CAD-483 and CAD-484, each one version after its archive. */
function archivedTree(): TaskState[] {
  return [
    taskState({ archive: FROM_482, version: 13 }),
    subtaskState({ archive: FROM_482, version: 2 }),
    grandchild({ archive: FROM_482, version: 2 }),
  ];
}

/**
 * CAD-483 and CAD-484 archived from CAD-483 under a parent CAD-482.
 *
 * @param parent - What replaces the state of CAD-482.
 * @returns The tasks.
 */
function archivedSubtree(parent: Partial<TaskState> = {}): TaskState[] {
  return [
    taskState(parent),
    subtaskState({ archive: FROM_483, version: 2 }),
    grandchild({ archive: FROM_483, version: 2 }),
  ];
}

/**
 * Builds the restoration through a task by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function unarchive(overrides: Partial<UnarchiveTaskInput> = {}): UnarchiveTaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    expectedVersions: null,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord holding the given tasks.
 *
 * @param stored - The tasks.
 * @param spaces - Builds the fake spaces on the shared trace.
 * @returns The fake store, the fake spaces and the use case.
 */
function atelierNord(
  stored: readonly TaskState[] = archivedTree(),
  spaces: (trace: string[]) => InMemorySpaceDirectory = (trace: string[]) =>
    new InMemorySpaceDirectory({ trace }),
): {
  readonly tasks: InMemoryTasks;
  readonly directory: InMemorySpaceDirectory;
  readonly useCase: UnarchiveTask;
} {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: stored, trace });
  const directory: InMemorySpaceDirectory = spaces(trace);
  return {
    tasks,
    directory,
    useCase: new UnarchiveTask(tasks, atelierNordMembers([], trace), directory),
  };
}

const camille = { type: 'user', id: CAMILLE } as const;

describe('UnarchiveTask: a restoration brings the whole archive back, from its root', () => {
  it.each(['CAD-482', 'CAD-483', 'CAD-484'])(
    'restores every member through %s and answers the root',
    async (taskKey: string) => {
      const { tasks, useCase } = atelierNord();

      const view = await useCase.execute(unarchive({ taskKey }));

      expect(view).toMatchObject({
        key: 'CAD-482',
        version: 14,
        archivedAt: null,
        archivedBy: null,
        subtaskCounts: { total: 1, closed: 0 },
      });
      for (const [id, version] of [
        [CAD_482, 14],
        [CAD_483, 3],
        [CAD_484, 3],
      ] as const) {
        expect(tasks.stored(id)).toMatchObject({ archive: null, updatedAt: NOW, version });
      }
    },
  );

  it('appends task.unarchived.v1 for each member, the root first, then by depth', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(unarchive({ taskKey: 'CAD-484' }));

    expect(tasks.events).toEqual([
      {
        kind: 'unarchived',
        key: 'CAD-482',
        version: 14,
        rootKey: 'CAD-482',
        parentKey: null,
        actor: camille,
      },
      {
        kind: 'unarchived',
        key: 'CAD-483',
        version: 3,
        rootKey: 'CAD-482',
        parentKey: 'CAD-482',
        actor: camille,
      },
      {
        kind: 'unarchived',
        key: 'CAD-484',
        version: 3,
        rootKey: 'CAD-482',
        parentKey: 'CAD-483',
        actor: camille,
      },
    ]);
    expect(tasks.activity.size).toBe(0);
  });

  it('locks the members in one statement, without a lock on the task first, and writes them in one', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(unarchive({ taskKey: 'CAD-483' }));

    expect(tasks.trace).not.toContain('tasks.findByKey:lock');
    expect(tasks.trace.filter((call: string): boolean => call.startsWith('tasks.'))).toEqual([
      'tasks.findByKey:read',
      'tasks.lockArchive',
      'tasks.writeArchives',
    ]);
  });

  it('leaves an older archive of a subtask archived', async () => {
    const { tasks, useCase } = atelierNord([
      taskState({ archive: FROM_482, version: 13 }),
      subtaskState({ archive: FROM_483, version: 2 }),
    ]);

    const view = await useCase.execute(unarchive());

    expect(tasks.stored(CAD_483)).toMatchObject({ archive: FROM_483, version: 2 });
    expect(view.subtaskCounts).toEqual({ total: 0, closed: 0 });
  });
});

describe('UnarchiveTask: the parent of the root takes it back, or the root is detached', () => {
  it('keeps a live parent of its list with room and levels for the archive', async () => {
    const { tasks, useCase } = atelierNord(archivedSubtree());

    const view = await useCase.execute(unarchive({ taskKey: 'CAD-484' }));

    expect(view).toMatchObject({ key: 'CAD-483', parentKey: 'CAD-482', version: 3 });
    expect(tasks.stored(CAD_483).parentId).toBe(CAD_482);
  });

  it.each<[string, readonly TaskState[]]>([
    ['archived', archivedSubtree({ archive: archiveFrom(CAD_482), version: 13 })],
    ['in another list', archivedSubtree({ listId: BUGS })],
    [
      'full, with 25 live subtasks',
      [
        ...archivedSubtree(),
        ...Array.from({ length: 25 }, (_unused: unknown, index: number) =>
          queryTask(index + 1, { parentId: CAD_482, parentKey: TaskKey.of('CAD', 482) }),
        ),
      ],
    ],
    [
      'too deep for the archive, at level 2 with an archive of 2 levels',
      [...archivedSubtree({ parentId: CAD_490, parentKey: TaskKey.of('CAD', 490) }), cad490State()],
    ],
  ])('detaches the root from a parent %s; it stays in its list', async (_case, stored) => {
    const { tasks, useCase } = atelierNord(stored);

    const view = await useCase.execute(unarchive({ taskKey: 'CAD-483' }));

    expect(view).toMatchObject({ key: 'CAD-483', parentKey: null, listId: SPRINT_14 });
    expect(tasks.stored(CAD_483)).toMatchObject({ parentId: null, parentKey: null });
    expect(tasks.stored(CAD_484).parentId).toBe(CAD_483);
    expect(tasks.events[0]).toMatchObject({ key: 'CAD-483', parentKey: null, rootKey: 'CAD-483' });
  });

  it('counts the live subtasks only: an archived one leaves room for the root', async () => {
    const { useCase } = atelierNord([
      ...archivedSubtree(),
      ...Array.from({ length: 24 }, (_unused: unknown, index: number) =>
        queryTask(index + 1, { parentId: CAD_482, parentKey: TaskKey.of('CAD', 482) }),
      ),
      queryTask(30, {
        parentId: CAD_482,
        parentKey: TaskKey.of('CAD', 482),
        archive: archiveFrom(queryTask(30).id),
      }),
    ]);

    expect((await useCase.execute(unarchive({ taskKey: 'CAD-483' }))).parentKey).toBe('CAD-482');
  });

  it('locks the parent after the members', async () => {
    const { tasks, useCase } = atelierNord(archivedSubtree());

    await useCase.execute(unarchive({ taskKey: 'CAD-483' }));

    const calls: string[] = tasks.trace.filter((call: string): boolean =>
      call.startsWith('tasks.'),
    );
    expect(calls.indexOf('tasks.lockArchive')).toBeLessThan(calls.indexOf('tasks.lockByIds'));
  });
});

describe('UnarchiveTask: an archived list comes back with its task', () => {
  const archivedSprint = (trace: string[]): InMemorySpaceDirectory =>
    new InMemorySpaceDirectory({
      lists: atelierNordLists({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR }),
      trace,
    });

  it('restores the list through the spaces module before the events of the tasks', async () => {
    const { tasks, directory, useCase } = atelierNord(archivedTree(), archivedSprint);

    await useCase.execute(unarchive());

    expect(directory.restoreCalls).toEqual([SPRINT_14]);
    expect(directory.stateOf(SPRINT_14)).toMatchObject({ archivedAt: null, version: 2 });
    const unlisted: number = tasks.trace.indexOf('spaces.listUnarchived');
    expect(unlisted).toBeGreaterThan(tasks.trace.indexOf('tasks.lockArchive'));
    expect(unlisted).toBeLessThan(tasks.trace.indexOf('events.unarchived'));
  });

  it('does not call the spaces module for a live list', async () => {
    const { directory, useCase } = atelierNord();

    await useCase.execute(unarchive());

    expect(directory.restoreCalls).toEqual([]);
  });

  it('answers the refusal of the spaces module and restores nothing', async () => {
    /** Spaces that refuse the list, as after a grant withdrawn while the restoration ran. */
    class RefusingSpaces extends InMemorySpaceDirectory {
      // #region Methods
      /**
       * Refuses the restoration of the list.
       *
       * @returns The refusal.
       */
      public override restoreArchivedList(): Promise<ListRestoration> {
        return Promise.resolve({ outcome: 'role-insufficient', role: 'view' });
      }
      // #endregion
    }
    const { tasks, useCase } = atelierNord(
      archivedTree(),
      (trace: string[]) =>
        new RefusingSpaces({
          lists: atelierNordLists({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR }),
          trace,
        }),
    );

    expect(await refusalOf(useCase.execute(unarchive()))).toEqual({
      reason: 'role-insufficient',
      role: 'view',
    });
    expect(tasks.stored(CAD_482).archive).toEqual(FROM_482);
    expect(tasks.events).toEqual([]);
  });
});

describe('UnarchiveTask: a task that is not archived answers as it is', () => {
  it('answers the same version and writes nothing', async () => {
    const { tasks, useCase } = atelierNord([taskState()]);

    const view = await useCase.execute(unarchive({ expectedVersions: [12] }));

    expect(view).toMatchObject({ version: 12, archivedAt: null });
    expect(tasks.events).toEqual([]);
    expect(tasks.trace).not.toContain('tasks.lockArchive');
  });

  it('checks If-Match on its version', async () => {
    const { useCase } = atelierNord([taskState()]);

    expect(await refusalOf(useCase.execute(unarchive({ expectedVersions: [3] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
  });

  it('reads the task again when another restoration of its archive committed first', async () => {
    const { tasks } = atelierNord([taskState(), subtaskState()]);
    let stale: boolean = true;
    const racing: TasksUnitOfWork = {
      run: <TResult>(work: (store: TasksStore) => Promise<TResult>): Promise<TResult> =>
        tasks.run((store: TasksStore): Promise<TResult> =>
          work({
            ...store,
            tasks: {
              ...store.tasks,
              findByKey: (organizationId: string, key: TaskKey, lock: boolean) => {
                if (stale) {
                  stale = false;
                  return Promise.resolve(Task.restore(taskState({ archive: FROM_482 })));
                }
                return store.tasks.findByKey(organizationId, key, lock);
              },
            },
          }),
        ),
      runReadOnly: <TResult>(work: (store: TasksStore) => Promise<TResult>): Promise<TResult> =>
        tasks.runReadOnly(work),
    };

    const view = await new UnarchiveTask(
      racing,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    ).execute(unarchive());

    expect(view).toMatchObject({ key: 'CAD-482', version: 12, archivedAt: null });
    expect(tasks.trace).not.toContain('tasks.writeArchives');
  });
});

describe('UnarchiveTask: the refusals, task-not-found, then role-insufficient, then If-Match', () => {
  it('refuses an unknown key and a task of a list the actor has no role on', async () => {
    const { useCase } = atelierNord(archivedTree(), () => sprint14SharedWith({ [HUGO]: 'view' }));

    expect(await refusalOf(useCase.execute(unarchive({ taskKey: 'CAD-999' })))).toEqual({
      reason: 'task-not-found',
    });
    expect(await refusalOf(useCase.execute(unarchive({ actorUserId: LEA })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses without edit before a stale If-Match, and locks nothing', async () => {
    const { tasks, useCase } = atelierNord(archivedTree(), () =>
      sprint14SharedWith({ [HUGO]: 'comment' }),
    );

    expect(
      await refusalOf(useCase.execute(unarchive({ actorUserId: HUGO, expectedVersions: [3] }))),
    ).toEqual({ reason: 'role-insufficient', role: 'comment' });
    expect(tasks.trace).not.toContain('tasks.lockArchive');
  });

  it('checks If-Match on the locked task of the path, not on the root', async () => {
    const { tasks, useCase } = atelierNord();

    expect(
      await refusalOf(useCase.execute(unarchive({ taskKey: 'CAD-484', expectedVersions: [13] }))),
    ).toEqual({ reason: 'version-mismatch', version: 2 });
    expect(tasks.stored(CAD_482).archive).toEqual(FROM_482);
    expect(
      (await useCase.execute(unarchive({ taskKey: 'CAD-484', expectedVersions: [2] }))).key,
    ).toBe('CAD-482');
  });
});
