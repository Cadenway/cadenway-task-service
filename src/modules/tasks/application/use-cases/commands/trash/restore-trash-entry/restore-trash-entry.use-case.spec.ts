import { describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_482_ENTRY,
  CAD_483,
  CAD_484,
  CAMILLE,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  NOW,
  PRODUIT,
  SPRINT_14,
  TRASHED_AT,
  archiveFrom,
  atelierNordLists,
  atelierNordMembers,
  queryTask,
  refusalOf,
  sprint14SharedWith,
  storedEntry,
  subtaskState,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import type { StoredTrashEntry } from '../../../tasks.fixture.js';
import type { RestoreTrashEntryInput } from './restore-trash-entry.input.js';
import { RestoreTrashEntry } from './restore-trash-entry.use-case.js';

/** The entry of CAD-483 and CAD-484, deleted from under CAD-482. */
const ENTRY_483: string = '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e04';

/** A task archived alone below CAD-484, a fourth level the live tree does not count. */
const CAD_499: string = '019a7200-0000-7000-8000-000000000499';

/** Camille Martin, the actor of the specs. */
const camille = { type: 'user', id: CAMILLE } as const;

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

/** CAD-482, CAD-483 and CAD-484 in the entry of CAD-482, one version after their deletion. */
function trashedTree(): TaskState[] {
  return [
    taskState({ trash: trashIn(), version: 13 }),
    subtaskState({ trash: trashIn(), version: 2 }),
    grandchild({ trash: trashIn(), version: 2 }),
  ];
}

/**
 * CAD-483 and CAD-484 in their own entry, under CAD-482.
 *
 * @param parent - What replaces the state of CAD-482.
 * @returns The tasks.
 */
function trashedSubtree(parent: Partial<TaskState> = {}): TaskState[] {
  return [
    taskState(parent),
    subtaskState({ trash: trashIn(ENTRY_483), version: 2 }),
    grandchild({ trash: trashIn(ENTRY_483), version: 2 }),
  ];
}

/** The entry of CAD-483 and CAD-484. */
const entry483: Partial<StoredTrashEntry> = {
  id: ENTRY_483,
  rootTaskId: CAD_483,
  parentKey: 'CAD-482',
  taskCount: 2,
};

/**
 * Builds the restoration of an entry by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function restore(overrides: Partial<RestoreTrashEntryInput> = {}): RestoreTrashEntryInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    entryId: CAD_482_ENTRY,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord.
 *
 * @param stored - The tasks.
 * @param entries - The trash entries.
 * @param spaces - Builds the fake spaces on the shared trace.
 * @returns The fake store, the fake spaces and the use case.
 */
function atelierNord(
  stored: readonly TaskState[] = trashedTree(),
  entries: readonly Partial<StoredTrashEntry>[] = [{}],
  spaces: (trace: string[]) => InMemorySpaceDirectory = (trace: string[]) =>
    new InMemorySpaceDirectory({ trace }),
): {
  readonly tasks: InMemoryTasks;
  readonly directory: InMemorySpaceDirectory;
  readonly useCase: RestoreTrashEntry;
} {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({
    tasks: stored,
    trace,
    trashEntries: entries.map((entry) => storedEntry(entry)),
  });
  const directory: InMemorySpaceDirectory = spaces(trace);
  return {
    tasks,
    directory,
    useCase: new RestoreTrashEntry(tasks, atelierNordMembers([], trace), directory),
  };
}

describe('RestoreTrashEntry: an entry comes back to its list, its root and every subtask', () => {
  it('brings every task back live at its next version and deletes the entry', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(restore());

    expect(tasks.stored(CAD_482)).toMatchObject({ trash: null, version: 14, updatedAt: NOW });
    expect(tasks.stored(CAD_483)).toMatchObject({ trash: null, version: 3, parentId: CAD_482 });
    expect(tasks.stored(CAD_484)).toMatchObject({ trash: null, version: 3, parentId: CAD_483 });
    expect(tasks.stored(CAD_482).checklist).toHaveLength(2);
    expect(tasks.trashEntries.size).toBe(0);
  });

  it('answers the root read again with its checklist, its list and what came back', async () => {
    const { useCase } = atelierNord();

    const restored = await useCase.execute(restore());

    expect(restored).toMatchObject({
      task: { key: 'CAD-482', version: 14, checklist: [{ text: 'Maquette validée' }, {}] },
      list: { id: SPRINT_14, callerRole: 'edit' },
      subtaskCount: 2,
      detached: false,
      listRestored: false,
      spaceRestored: false,
    });
    expect(restored.task.subtaskCounts).toEqual({ total: 1, closed: 0 });
  });

  it('emits task.restored.v1 per task, the root first, then by depth, with the entry and the root', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(restore());

    expect(tasks.events).toEqual([
      {
        kind: 'restored',
        key: 'CAD-482',
        version: 14,
        entryId: CAD_482_ENTRY,
        rootKey: 'CAD-482',
        parentKey: null,
        purgeAt: null,
        actor: camille,
      },
      expect.objectContaining({ kind: 'restored', key: 'CAD-483', parentKey: 'CAD-482' }),
      expect.objectContaining({ kind: 'restored', key: 'CAD-484', parentKey: 'CAD-483' }),
    ]);
  });

  it('keeps the root under a live parent of its list that can take it', async () => {
    const { tasks, useCase } = atelierNord(trashedSubtree(), [entry483]);

    const restored = await useCase.execute(restore({ entryId: ENTRY_483 }));

    expect(restored).toMatchObject({
      task: { key: 'CAD-483', parentKey: 'CAD-482' },
      detached: false,
    });
    expect(tasks.stored(CAD_483).parentId).toBe(CAD_482);
  });

  it.each<[string, Partial<TaskState>]>([
    ['in the trash', { trash: trashIn('019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e05'), version: 13 }],
    ['archived', { archive: archiveFrom(CAD_482), version: 13 }],
  ])('detaches the root from a parent %s', async (_case: string, parent: Partial<TaskState>) => {
    const { tasks, useCase } = atelierNord(trashedSubtree(parent), [entry483]);

    const restored = await useCase.execute(restore({ entryId: ENTRY_483 }));

    expect(restored).toMatchObject({ task: { key: 'CAD-483', parentKey: null }, detached: true });
    expect(tasks.stored(CAD_483)).toMatchObject({ parentId: null, parentKey: null, version: 3 });
    expect(tasks.stored(CAD_484).parentId).toBe(CAD_483);
    expect(tasks.events[0]).toMatchObject({ key: 'CAD-483', parentKey: null });
  });

  it('answers detached for a root whose parent was erased while it waited in the trash', async () => {
    const { tasks, useCase } = atelierNord(
      [
        subtaskState({ trash: trashIn(ENTRY_483), version: 2, parentId: null, parentKey: null }),
        grandchild({ trash: trashIn(ENTRY_483), version: 2 }),
      ],
      [entry483],
    );

    const restored = await useCase.execute(restore({ entryId: ENTRY_483 }));

    expect(restored).toMatchObject({ task: { key: 'CAD-483', parentKey: null }, detached: true });
    expect(tasks.stored(CAD_483)).toMatchObject({ parentId: null, version: 3 });
  });

  it('detaches the root from a parent that holds 25 live subtasks', async () => {
    const siblings: TaskState[] = Array.from({ length: 25 }, (_: unknown, index: number) =>
      queryTask(index, { parentId: CAD_482, parentKey: TaskKey.of('CAD', 482) }),
    );
    const { useCase } = atelierNord([...trashedSubtree(), ...siblings], [entry483]);

    expect((await useCase.execute(restore({ entryId: ENTRY_483 }))).detached).toBe(true);
  });

  it('detaches a root whose levels no longer fit under its parent', async () => {
    const top: TaskState = queryTask(1);
    const { useCase } = atelierNord(
      [top, ...trashedSubtree({ parentId: top.id, parentKey: top.key })],
      [entry483],
    );

    expect((await useCase.execute(restore({ entryId: ENTRY_483 }))).detached).toBe(true);
  });

  it('brings a deleted list and its deleted space back before the tasks', async () => {
    const { tasks, directory, useCase } = atelierNord(
      undefined,
      undefined,
      (trace: string[]) =>
        new InMemorySpaceDirectory({
          trace,
          deletedLists: { [SPRINT_14]: camille },
          deletedSpaces: { [PRODUIT]: camille },
        }),
    );

    const restored = await useCase.execute(restore());

    expect(restored).toMatchObject({ listRestored: true, spaceRestored: true });
    expect(directory.isDeleted(SPRINT_14)).toBe(false);
    const order: string[] = tasks.trace.filter((call: string): boolean =>
      ['spaces.spaceRestored', 'spaces.listRestored', 'events.restored'].includes(call),
    );
    expect(order.slice(0, 3)).toEqual([
      'spaces.spaceRestored',
      'spaces.listRestored',
      'events.restored',
    ]);
  });

  it('brings an archived subtask back archived, the height counting the live tasks only', async () => {
    const archivedBelow: TaskState = subtaskState({
      id: CAD_499,
      key: TaskKey.of('CAD', 499),
      parentId: CAD_484,
      parentKey: TaskKey.of('CAD', 484),
      archive: archiveFrom(CAD_499),
      trash: trashIn(ENTRY_483),
      version: 3,
    });
    const { tasks, useCase } = atelierNord(
      [...trashedSubtree(), archivedBelow],
      [{ ...entry483, taskCount: 3 }],
    );

    const restored = await useCase.execute(restore({ entryId: ENTRY_483 }));

    // CAD-482 is at level 1 and the live tasks make 2 levels: it takes CAD-483 back.
    expect(restored).toMatchObject({ subtaskCount: 2, detached: false });
    expect(tasks.stored(CAD_483).parentId).toBe(CAD_482);
    expect(tasks.stored(CAD_499)).toMatchObject({
      archive: archiveFrom(CAD_499),
      trash: null,
      parentId: CAD_484,
      version: 4,
    });
    expect(tasks.events.map((event) => event.key)).toEqual(['CAD-483', 'CAD-484', 'CAD-499']);
  });

  it('brings an archived root back archived and never detaches it, answering it as it reads', async () => {
    const { tasks, useCase } = atelierNord(
      [
        taskState({ listId: BUGS }),
        subtaskState({ archive: archiveFrom(CAD_483), trash: trashIn(ENTRY_483), version: 3 }),
        grandchild({ archive: archiveFrom(CAD_483), trash: trashIn(ENTRY_483), version: 3 }),
      ],
      [{ ...entry483, parentKey: null }],
    );

    const restored = await useCase.execute(restore({ entryId: ENTRY_483 }));

    expect(restored).toMatchObject({ task: { key: 'CAD-483', version: 4 }, detached: false });
    expect(tasks.stored(CAD_483)).toMatchObject({
      archive: archiveFrom(CAD_483),
      trash: null,
      parentId: CAD_482,
    });
    expect(tasks.stored(CAD_484).archive).toEqual(archiveFrom(CAD_483));
    expect(tasks.trace).not.toContain('tasks.lockStanding');
  });

  it('leaves an archived list that is not deleted archived, its tasks live', async () => {
    const { tasks, useCase } = atelierNord(
      undefined,
      undefined,
      (trace: string[]) =>
        new InMemorySpaceDirectory({
          trace,
          lists: atelierNordLists({ archivedAt: TRASHED_AT, archivedBy: camille }),
        }),
    );

    const restored = await useCase.execute(restore());

    expect(restored).toMatchObject({ listRestored: false, list: { archivedAt: TRASHED_AT } });
    expect(tasks.stored(CAD_482).trash).toBeNull();
  });

  it('locks the actor, the entry, its tasks, the parent of the root, then the list', async () => {
    const { tasks, useCase } = atelierNord(trashedSubtree(), [entry483]);

    await useCase.execute(restore({ entryId: ENTRY_483 }));

    expect(tasks.trace.slice(0, 7)).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      'trash.find',
      'spaces.findTrashList',
      'trash.lock',
      'tasks.lockTrashEntries',
      'tasks.lockStanding',
      'spaces.restoreDeletedList',
    ]);
  });

  it('records nothing in the activity log', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(restore());

    expect(tasks.activity.size).toBe(0);
  });
});

describe('RestoreTrashEntry: an entry the actor may not restore is not found', () => {
  it.each<[string, Partial<StoredTrashEntry>, Partial<RestoreTrashEntryInput>]>([
    ['an unknown entry', {}, { entryId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e99' }],
    [
      'an entry handed to the purge by "Vider la corbeille"',
      { purgeRequest: { at: NOW, by: camille } },
      {},
    ],
  ])('refuses %s', async (_case, entry, input) => {
    const { tasks, useCase } = atelierNord(undefined, [entry]);

    expect(await refusalOf(useCase.execute(restore(input)))).toEqual({
      reason: 'trash-entry-not-found',
    });
    expect(tasks.stored(CAD_482).trash).toEqual(trashIn());
  });

  it('refuses an entry of a list the actor would only see, as not found, never a 403', async () => {
    const { useCase } = atelierNord(undefined, undefined, (trace: string[]) =>
      sprint14SharedWith({ [LEA]: 'view' }, trace),
    );

    expect(await refusalOf(useCase.execute(restore({ actorUserId: LEA })))).toEqual({
      reason: 'trash-entry-not-found',
    });
  });

  it('refuses an entry of a deleted list the actor would not have edit on as if not deleted', async () => {
    const { useCase } = atelierNord(
      undefined,
      undefined,
      (trace: string[]) =>
        new InMemorySpaceDirectory({
          trace,
          lists: atelierNordLists({ organizationAccess: false }),
          listGrants: { [SPRINT_14]: { [LEA]: 'comment' } },
          deletedLists: { [SPRINT_14]: camille },
        }),
    );

    expect(await refusalOf(useCase.execute(restore({ actorUserId: LEA })))).toEqual({
      reason: 'trash-entry-not-found',
    });
  });

  it('answers a refusal of the spaces module under its locks as not found and writes nothing', async () => {
    /** A directory whose grant was withdrawn between the read and the lock of the list. */
    class WithdrawnUnderLock extends InMemorySpaceDirectory {
      // #region Methods
      /**
       * Answers the list seen without edit under its lock.
       *
       * @returns The refusal of the spaces module.
       */
      public override restoreDeletedList(): ReturnType<
        InMemorySpaceDirectory['restoreDeletedList']
      > {
        return Promise.resolve({ outcome: 'role-insufficient', role: 'view' });
      }
      // #endregion
    }
    const tasks = new InMemoryTasks({
      tasks: trashedTree(),
      trashEntries: [storedEntry()],
    });
    const useCase = new RestoreTrashEntry(tasks, atelierNordMembers(), new WithdrawnUnderLock());

    expect(await refusalOf(useCase.execute(restore()))).toEqual({
      reason: 'trash-entry-not-found',
    });
    expect(tasks.trashEntries.size).toBe(1);
    expect(tasks.events).toEqual([]);
  });
});
