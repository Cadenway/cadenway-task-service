import { describe, expect, it } from 'vitest';

import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_482_ENTRY,
  CAD_483,
  CAD_484,
  CAD_490,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  MAQUETTES,
  NOW,
  SPRINT_14,
  TRASHED_AT,
  TRASH_WRITES_OFF,
  TRASH_WRITES_ON,
  archiveFrom,
  atelierNordLists,
  atelierNordMembers,
  cad490State,
  priorityEntry,
  refusalOf,
  sprint14SharedWith,
  storedEntry,
  subtaskState,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import type { TrashTaskInput } from './trash-task.input.js';
import { TrashTask } from './trash-task.use-case.js';

/** NOW plus the 30 days of the trash. */
const PURGE_AT: Date = new Date('2026-12-08T10:20:00.000Z');

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

/** CAD-490 as a subtask of CAD-482, archived alone before. */
function archivedChild(): TaskState {
  return cad490State({
    parentId: CAD_482,
    parentKey: TaskKey.of('CAD', 482),
    archive: archiveFrom(CAD_490),
    version: 2,
  });
}

/** A task archived below CAD-484, a fourth level the live tree does not count. */
const CAD_499: string = '019a7200-0000-7000-8000-000000000499';

/** CAD-499, archived alone under CAD-484. */
function archivedBelow(): TaskState {
  return subtaskState({
    id: CAD_499,
    key: TaskKey.of('CAD', 499),
    parentId: CAD_484,
    parentKey: TaskKey.of('CAD', 484),
    name: 'Message d’erreur',
    archive: archiveFrom(CAD_499),
    version: 2,
  });
}

/** CAD-482 with its live subtask CAD-483 and sub-subtask CAD-484. */
function liveTree(): TaskState[] {
  return [taskState(), subtaskState(), grandchild()];
}

/**
 * Builds the deletion of a task by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function trash(overrides: Partial<TrashTaskInput> = {}): TrashTaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    expectedVersions: null,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord.
 *
 * @param stored - The tasks.
 * @param spaces - Builds the fake spaces on the shared trace.
 * @param entries - The trash entries.
 * @returns The fake store and the use case.
 */
function atelierNord(
  stored: readonly TaskState[] = liveTree(),
  spaces: (trace: string[]) => InMemorySpaceDirectory = (trace: string[]) =>
    new InMemorySpaceDirectory({ trace }),
  entries: Parameters<typeof storedEntry>[0][] = [],
): { readonly tasks: InMemoryTasks; readonly useCase: TrashTask } {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({
    tasks: stored,
    trace,
    trashEntries: entries.map((entry) => storedEntry(entry)),
  });
  return {
    tasks,
    useCase: new TrashTask(TRASH_WRITES_ON, tasks, atelierNordMembers([], trace), spaces(trace)),
  };
}

/**
 * A unit of work over the fake in which another transaction commits a change of CAD-482 after the
 * read without lock and before the lock of its tree: the change lands when the tree is first read.
 * It also records the ids each `lockByIds` call locks.
 *
 * @param tasks - The fake store.
 * @param change - The change of CAD-482, or `null` for none.
 * @param locks - Receives the ids of each `lockByIds` call.
 * @returns The unit of work.
 */
function changedBeforeLock(
  tasks: InMemoryTasks,
  change: ((state: TaskState) => TaskState) | null,
  locks: (readonly string[])[] = [],
): TasksUnitOfWork {
  return {
    run: <TResult>(work: (store: TasksStore) => Promise<TResult>): Promise<TResult> =>
      tasks.run((store: TasksStore): Promise<TResult> => {
        let changed: boolean = change === null;
        return work({
          ...store,
          tasks: {
            ...store.tasks,
            trashTrees: async (organizationId: string, rootIds: readonly string[]) => {
              if (!changed && change !== null) {
                changed = true;
                const before: Task = Task.restore(tasks.stored(CAD_482));
                await store.tasks.save(before, Task.restore(change(before.snapshot)));
              }
              return store.tasks.trashTrees(organizationId, rootIds);
            },
            lockByIds: (
              organizationId: string,
              ids: readonly string[],
              withChecklists?: boolean,
            ) => {
              locks.push([...ids]);
              return store.tasks.lockByIds(organizationId, ids, withChecklists);
            },
          },
        });
      }),
    runReadOnly: <TResult>(work: (store: TasksStore) => Promise<TResult>): Promise<TResult> =>
      tasks.runReadOnly(work),
  };
}

/**
 * Builds a use case on Atelier Nord whose CAD-482 another transaction changes between the read
 * without lock and the lock of its tree.
 *
 * @param change - The change of CAD-482.
 * @param entries - The trash entries.
 * @returns The fake store and the use case.
 */
function racedBy(
  change: (state: TaskState) => TaskState,
  entries: Parameters<typeof storedEntry>[0][] = [],
): { readonly tasks: InMemoryTasks; readonly useCase: TrashTask } {
  const tasks = new InMemoryTasks({
    tasks: liveTree(),
    trashEntries: entries.map((entry) => storedEntry(entry)),
  });
  return {
    tasks,
    useCase: new TrashTask(
      TRASH_WRITES_ON,
      changedBeforeLock(tasks, change),
      atelierNordMembers([]),
      new InMemorySpaceDirectory(),
    ),
  };
}

describe('TrashTask: a deletion moves the task and its subtasks at every level to the trash as one entry', () => {
  it('answers the entry, with its root, list, subtasks and purge instant 30 days later', async () => {
    const { tasks, useCase } = atelierNord();

    const entry = await useCase.execute(trash());

    const [stored] = [...tasks.trashEntries.values()];
    expect(entry).toEqual({
      id: stored?.id,
      task: { key: 'CAD-482', name: 'Refondre l’écran de connexion SSO', status: 'progress' },
      parentKey: null,
      subtaskCount: 2,
      list: { id: SPRINT_14, spaceId: taskState().spaceId, name: 'Sprint 14', state: 'active' },
      trashedAt: NOW,
      trashedBy: { type: 'user', id: CAMILLE },
      purgeAt: PURGE_AT,
    });
    expect(stored).toMatchObject({ rootTaskId: CAD_482, listId: SPRINT_14, taskCount: 3 });
  });

  it('gives every task of the subtree the entry, its next version and the instant', async () => {
    const { tasks, useCase } = atelierNord();

    const entry = await useCase.execute(trash());

    expect(tasks.stored(CAD_482)).toMatchObject({
      trash: { entryId: entry.id },
      version: 13,
      updatedAt: NOW,
    });
    expect(tasks.stored(CAD_483)).toMatchObject({ trash: { entryId: entry.id }, version: 2 });
    expect(tasks.stored(CAD_484)).toMatchObject({ trash: { entryId: entry.id }, version: 2 });
    expect(tasks.stored(CAD_482).checklist).toHaveLength(2);
  });

  it('emits task.trashed.v1 per task, the root first, then by depth, with the entry and the root', async () => {
    const { tasks, useCase } = atelierNord();

    const entry = await useCase.execute(trash());

    expect(tasks.events).toEqual([
      {
        kind: 'trashed',
        key: 'CAD-482',
        version: 13,
        entryId: entry.id,
        rootKey: 'CAD-482',
        parentKey: null,
        purgeAt: PURGE_AT,
        actor: { type: 'user', id: CAMILLE },
      },
      expect.objectContaining({ kind: 'trashed', key: 'CAD-483', rootKey: 'CAD-482' }),
      expect.objectContaining({ kind: 'trashed', key: 'CAD-484', parentKey: 'CAD-483' }),
    ]);
  });

  it('enqueues the drop of the pending requests of the tasks of the entry, once per entry', async () => {
    const { tasks, useCase } = atelierNord();

    const entry = await useCase.execute(trash());

    expect(tasks.jobs).toEqual([
      {
        queue: 'task.drop-trashed-task-requests',
        entryId: entry.id,
        taskIds: [CAD_482, CAD_483, CAD_484],
      },
    ]);
  });

  it('takes an archived subtask, which keeps its archive, and leaves a subtask deleted before in its own entry', async () => {
    const deletedBefore: TaskState = grandchild({ trash: trashIn(), version: 2 });
    const { tasks, useCase } = atelierNord(
      [taskState(), subtaskState(), deletedBefore, archivedChild()],
      undefined,
      [{ rootTaskId: CAD_484, taskCount: 1, parentKey: 'CAD-483' }],
    );

    const entry = await useCase.execute(trash());

    expect(entry.subtaskCount).toBe(2);
    expect(tasks.stored(CAD_484).trash).toEqual(trashIn());
    expect(tasks.stored(CAD_490)).toMatchObject({
      archive: archiveFrom(CAD_490),
      trash: { entryId: entry.id },
      version: 3,
    });
    expect(tasks.events.map((event) => event.key)).toEqual(['CAD-482', 'CAD-483', 'CAD-490']);
  });

  it('takes the archived tasks below the three levels of the live tree, root first, then by depth', async () => {
    const { tasks, useCase } = atelierNord([...liveTree(), archivedBelow()]);

    const entry = await useCase.execute(trash());

    expect(entry.subtaskCount).toBe(3);
    expect(tasks.stored(CAD_499)).toMatchObject({
      archive: archiveFrom(CAD_499),
      trash: { entryId: entry.id },
    });
    expect(tasks.events.map((event) => event.key)).toEqual([
      'CAD-482',
      'CAD-483',
      'CAD-484',
      'CAD-499',
    ]);
  });

  it('leaves a subtask in another list, an archived task whose parent moved away', async () => {
    const elsewhere: TaskState = { ...archivedChild(), listId: BUGS };
    const { tasks, useCase } = atelierNord([...liveTree(), elsewhere]);

    const entry = await useCase.execute(trash());

    expect(entry.subtaskCount).toBe(2);
    expect(tasks.stored(CAD_490)).toMatchObject({ archive: archiveFrom(CAD_490), trash: null });
  });

  it('keeps the parent of a subtask deleted alone, as it reads', async () => {
    const { useCase } = atelierNord();

    const entry = await useCase.execute(trash({ taskKey: 'CAD-483' }));

    expect(entry).toMatchObject({ parentKey: 'CAD-482', subtaskCount: 1 });
  });

  it('answers the list as archived when it is', async () => {
    const { useCase } = atelierNord(
      liveTree(),
      (trace: string[]) =>
        new InMemorySpaceDirectory({
          trace,
          lists: atelierNordLists({
            archivedAt: TRASHED_AT,
            archivedBy: { type: 'user', id: HUGO },
          }),
        }),
    );

    const entry = await useCase.execute(trash());

    expect(entry.list.state).toBe('archived');
  });

  it('records nothing in the activity log', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: liveTree(), activity: [priorityEntry()], trace });
    const useCase = new TrashTask(
      TRASH_WRITES_ON,
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    );

    await useCase.execute(trash());

    expect([...tasks.activity.values()]).toEqual([priorityEntry()]);
  });

  it('locks the actor, then the task with its tree in one statement by id, nothing locked by key before, read again under the locks', async () => {
    const { tasks, useCase } = atelierNord([...liveTree(), archivedChild()]);

    await useCase.execute(trash());

    expect(tasks.trace.slice(0, 6)).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      'tasks.findByKey:read',
      'spaces.findVisibleList',
      'tasks.trashTrees',
      'tasks.lockByIds',
      'tasks.trashTrees',
    ]);
    expect(tasks.trace).not.toContain('tasks.findByKey:lock');
  });

  it('locks the root with its subtasks in one call, none of them held before', async () => {
    const tasks = new InMemoryTasks({ tasks: [...liveTree(), archivedChild()] });
    const locks: (readonly string[])[] = [];
    const useCase = new TrashTask(
      TRASH_WRITES_ON,
      changedBeforeLock(tasks, null, locks),
      atelierNordMembers([]),
      new InMemorySpaceDirectory(),
    );

    await useCase.execute(trash());

    expect(locks.map((ids: readonly string[]): string[] => [...ids].sort())).toEqual([
      [CAD_482, CAD_483, CAD_484, CAD_490].sort(),
    ]);
    expect(tasks.stored(CAD_482).trash).not.toBeNull();
  });
});

describe('TrashTask: the refusals are checked again on the task as locked, the same as before the lock', () => {
  it('refuses a task moved meanwhile to a list the actor does not see as task-not-found', async () => {
    const tasks = new InMemoryTasks({ tasks: liveTree() });
    const useCase = new TrashTask(
      TRASH_WRITES_ON,
      changedBeforeLock(tasks, (state: TaskState) => ({
        ...state,
        listId: MAQUETTES,
        version: state.version + 1,
      })),
      atelierNordMembers([]),
      new InMemorySpaceDirectory(),
    );

    expect(await refusalOf(useCase.execute(trash({ actorUserId: LEA })))).toEqual({
      reason: 'task-not-found',
    });
    expect(tasks.trashEntries.size).toBe(0);
    expect(tasks.events).toEqual([]);
  });

  it('refuses a task archived meanwhile as task-archived', async () => {
    const { tasks, useCase } = racedBy((state: TaskState) => ({
      ...state,
      archive: archiveFrom(CAD_482),
      version: state.version + 1,
    }));

    expect(await refusalOf(useCase.execute(trash()))).toEqual({
      reason: 'task-archived',
      key: 'CAD-482',
    });
    expect(tasks.trashEntries.size).toBe(0);
  });

  it('refuses an If-Match the task matched before a change committed meanwhile as version-mismatch, with the locked version', async () => {
    const { tasks, useCase } = racedBy((state: TaskState) => ({
      ...state,
      name: 'Connexion SSO (v2)',
      version: state.version + 1,
    }));

    expect(await refusalOf(useCase.execute(trash({ expectedVersions: [12] })))).toEqual({
      reason: 'version-mismatch',
      version: 13,
    });
    expect(tasks.stored(CAD_482).trash).toBeNull();
  });

  it('answers a task trashed meanwhile task-trashed with its entry, as a read of it now answers', async () => {
    const { tasks, useCase } = racedBy(
      (state: TaskState) => ({ ...state, trash: trashIn(), version: state.version + 1 }),
      [{}],
    );

    expect(await refusalOf(useCase.execute(trash()))).toMatchObject({
      reason: 'task-trashed',
      key: 'CAD-482',
      entryId: CAD_482_ENTRY,
    });
    expect(tasks.trashEntries.size).toBe(1);
    expect(tasks.events).toEqual([]);
  });

  it('answers a task trashed meanwhile into an entry the actor may not restore task-not-found', async () => {
    const { useCase } = racedBy((state: TaskState) => ({
      ...state,
      trash: trashIn(),
      version: state.version + 1,
    }));

    expect(await refusalOf(useCase.execute(trash()))).toEqual({ reason: 'task-not-found' });
  });
});

describe('TrashTask: the refusals, in the order of the contract', () => {
  it('refuses first while the switch of the writes of the trash is off, reading nothing', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: liveTree(), trace });
    const useCase = new TrashTask(
      TRASH_WRITES_OFF,
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    );

    expect(await refusalOf(useCase.execute(trash()))).toEqual({
      reason: 'trash-writes-disabled',
    });
    expect(trace).toEqual([]);
    expect(tasks.runs).toBe(0);
    expect(tasks.stored(CAD_482).trash).toBeNull();
  });

  it('refuses an unknown key and a task of a list the actor has no role on as task-not-found', async () => {
    const { useCase } = atelierNord(liveTree(), (trace: string[]) => sprint14SharedWith({}, trace));

    expect(await refusalOf(useCase.execute(trash({ taskKey: 'CAD-999' })))).toEqual({
      reason: 'task-not-found',
    });
    expect(await refusalOf(useCase.execute(trash({ actorUserId: LEA })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('answers a task in the trash already task-trashed, with its entry, before the role', async () => {
    const { tasks, useCase } = atelierNord(
      [
        taskState({ trash: trashIn(), version: 13 }),
        subtaskState({ trash: trashIn(), version: 2 }),
      ],
      undefined,
      [{}],
    );

    expect(await refusalOf(useCase.execute(trash({ taskKey: 'CAD-483' })))).toEqual({
      reason: 'task-trashed',
      key: 'CAD-483',
      name: 'Ajouter le bouton SSO',
      entryId: CAD_482_ENTRY,
      rootKey: 'CAD-482',
      trashedAt: TRASHED_AT,
      trashedBy: { type: 'user', id: CAMILLE },
      purgeAt: new Date('2026-12-06T16:20:00.000Z'),
    });
    expect(tasks.events).toEqual([]);
  });

  it('answers a task in the trash task-not-found to an actor who could not change its list', async () => {
    const { useCase } = atelierNord(
      [taskState({ trash: trashIn(), version: 13 })],
      (trace: string[]) => sprint14SharedWith({ [LEA]: 'view' }, trace),
      [{ taskCount: 1 }],
    );

    expect(await refusalOf(useCase.execute(trash({ actorUserId: LEA })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses a viewer without edit as role-insufficient', async () => {
    const { useCase } = atelierNord(liveTree(), (trace: string[]) =>
      sprint14SharedWith({ [LEA]: 'comment' }, trace),
    );

    expect(await refusalOf(useCase.execute(trash({ actorUserId: LEA })))).toEqual({
      reason: 'role-insufficient',
      role: 'comment',
    });
  });

  it('refuses an archived task as task-archived, before If-Match', async () => {
    const { useCase } = atelierNord([taskState({ archive: archiveFrom(CAD_482), version: 13 })]);

    expect(await refusalOf(useCase.execute(trash({ expectedVersions: [1] })))).toEqual({
      reason: 'task-archived',
      key: 'CAD-482',
    });
  });

  it('refuses a stale If-Match as version-mismatch and writes nothing', async () => {
    const { tasks, useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(trash({ expectedVersions: [11] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
    expect(tasks.trashEntries.size).toBe(0);
    expect(tasks.jobs).toEqual([]);
    expect(tasks.stored(CAD_482).trash).toBeNull();
  });
});
