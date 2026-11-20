import { describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_482_ENTRY,
  CAD_483,
  CAD_490,
  CAMILLE,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  NOW,
  PRODUIT,
  SPRINT_14,
  archiveFrom,
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
import type { StoredTrashEntry } from '../../../tasks.fixture.js';
import type { PurgeTrashEntryInput } from './purge-trash-entry.input.js';
import { PurgeTrashEntry } from './purge-trash-entry.use-case.js';

/** Camille Martin, the actor of the specs. */
const camille = { type: 'user', id: CAMILLE } as const;

/** CAD-482 and CAD-483 in the entry of CAD-482. */
function trashedTree(): TaskState[] {
  return [
    taskState({ trash: trashIn(), version: 13 }),
    subtaskState({ trash: trashIn(), version: 2 }),
  ];
}

/**
 * Builds the erasure of the entry of CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function purge(overrides: Partial<PurgeTrashEntryInput> = {}): PurgeTrashEntryInput {
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
 * @param spaces - Builds the fake spaces.
 * @returns The fake store, the fake spaces and the use case.
 */
function atelierNord(
  stored: readonly TaskState[] = trashedTree(),
  entries: readonly Partial<StoredTrashEntry>[] = [{ taskCount: 2 }],
  spaces: () => InMemorySpaceDirectory = () => new InMemorySpaceDirectory(),
): {
  readonly tasks: InMemoryTasks;
  readonly directory: InMemorySpaceDirectory;
  readonly useCase: PurgeTrashEntry;
} {
  const tasks = new InMemoryTasks({
    tasks: stored,
    activity: [priorityEntry()],
    trashEntries: entries.map((entry) => storedEntry(entry)),
  });
  const directory: InMemorySpaceDirectory = spaces();
  return {
    tasks,
    directory,
    useCase: new PurgeTrashEntry(tasks, atelierNordMembers(), directory),
  };
}

describe('PurgeTrashEntry: "Supprimer définitivement" erases an entry for good', () => {
  it('erases the tasks of the entry, their activity and the entry', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(purge());

    expect(tasks.tasks.size).toBe(0);
    expect(tasks.activity.size).toBe(0);
    expect(tasks.trashEntries.size).toBe(0);
  });

  it('emits task.purged.v1 per task at its version plus one, the root first, with the actor', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(purge());

    expect(tasks.events).toEqual([
      {
        kind: 'purged',
        key: 'CAD-482',
        version: 14,
        entryId: CAD_482_ENTRY,
        rootKey: 'CAD-482',
        parentKey: null,
        purgeAt: null,
        actor: camille,
      },
      expect.objectContaining({ kind: 'purged', key: 'CAD-483', version: 3, parentKey: 'CAD-482' }),
    ]);
  });

  it('detaches an archived task that hung from a task of the entry, without a new version', async () => {
    const archived: TaskState = cad490State({
      parentId: CAD_483,
      parentKey: TaskKey.of('CAD', 483),
      archive: archiveFrom(CAD_490),
      version: 2,
    });
    const { tasks, useCase } = atelierNord([...trashedTree(), archived]);

    await useCase.execute(purge());

    expect(tasks.stored(CAD_490)).toMatchObject({
      parentId: null,
      parentKey: null,
      version: 2,
      archive: archiveFrom(CAD_490),
    });
    expect(tasks.events.map((event) => event.key)).toEqual(['CAD-482', 'CAD-483']);
  });

  it('erases a deleted list left without a task, and its deleted space with its last list', async () => {
    const { directory, useCase } = atelierNord(
      undefined,
      undefined,
      () =>
        new InMemorySpaceDirectory({
          deletedLists: { [SPRINT_14]: camille, [BUGS]: camille },
          deletedSpaces: { [PRODUIT]: camille },
        }),
    );

    await useCase.execute(purge());

    expect(directory.purgeCalls).toEqual([SPRINT_14]);
    expect(directory.isStored(SPRINT_14)).toBe(false);
    expect(directory.hasSpace(PRODUIT)).toBe(true);
  });

  it('leaves a list that still holds a task, and a live list, to the spaces module untouched', async () => {
    const { directory, useCase } = atelierNord(
      [...trashedTree(), cad490State()],
      undefined,
      () => new InMemorySpaceDirectory({ deletedLists: { [SPRINT_14]: camille } }),
    );

    await useCase.execute(purge());

    expect(directory.purgeCalls).toEqual([]);
    expect(directory.isStored(SPRINT_14)).toBe(true);
  });

  it('locks the deleted lists in one call once the tasks are deleted, and checks under that lock before an erasure', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({
      tasks: trashedTree(),
      trashEntries: [storedEntry({ taskCount: 2 })],
      trace,
    });
    const useCase = new PurgeTrashEntry(
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace, deletedLists: { [SPRINT_14]: camille } }),
    );

    await useCase.execute(purge());

    expect(
      trace.filter((call: string): boolean =>
        [
          'trash.erase',
          'spaces.lockDeletedLists',
          'tasks.listsWithTasks',
          'spaces.purgeDeletedList',
        ].includes(call),
      ),
    ).toEqual([
      'trash.erase',
      'spaces.lockDeletedLists',
      'tasks.listsWithTasks',
      'spaces.purgeDeletedList',
    ]);
  });

  it('neither probes nor erases a live list after an erasure', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({
      tasks: trashedTree(),
      trashEntries: [storedEntry({ taskCount: 2 })],
      trace,
    });
    const directory = new InMemorySpaceDirectory({ trace });
    const useCase = new PurgeTrashEntry(tasks, atelierNordMembers([], trace), directory);

    await useCase.execute(purge());

    expect(trace).toContain('spaces.lockDeletedLists');
    expect(trace).not.toContain('tasks.listsWithTasks');
    expect(directory.purgeCalls).toEqual([]);
  });

  it('locks the actor, the entry, then its tasks for update', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({
      tasks: trashedTree(),
      trashEntries: [storedEntry({ taskCount: 2 })],
      trace,
    });
    const useCase = new PurgeTrashEntry(
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    );

    await useCase.execute(purge());

    expect(trace.slice(0, 5)).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      'trash.find',
      'spaces.findTrashList',
      'trash.lock',
      'tasks.lockTrashEntries:update',
    ]);
  });
});

describe('PurgeTrashEntry: an entry the actor may not restore is not found', () => {
  it('refuses an unknown entry, one handed to the purge and one of a list seen only', async () => {
    const unknown = atelierNord();
    expect(
      await refusalOf(
        unknown.useCase.execute(purge({ entryId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e99' })),
      ),
    ).toEqual({ reason: 'trash-entry-not-found' });

    const handedOver = atelierNord(undefined, [{ purgeRequest: { at: NOW, by: camille } }]);
    expect(await refusalOf(handedOver.useCase.execute(purge()))).toEqual({
      reason: 'trash-entry-not-found',
    });

    const viewer = atelierNord(undefined, undefined, () => sprint14SharedWith({ [LEA]: 'view' }));
    expect(await refusalOf(viewer.useCase.execute(purge({ actorUserId: LEA })))).toEqual({
      reason: 'trash-entry-not-found',
    });
    expect(viewer.tasks.stored(CAD_482).trash).toEqual(trashIn());
  });
});
