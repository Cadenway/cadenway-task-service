import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAD_482_ENTRY,
  CAD_490,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  MAQUETTES,
  NADIA,
  NOW,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  TRASHED_AT,
  atelierNordLists,
  atelierNordMembers,
  cad490State,
  refusalOf,
  storedEntry,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import type { StoredTrashEntry } from '../../../tasks.fixture.js';
import type { ListTrashEntriesInput } from './list-trash-entries.input.js';
import { ListTrashEntries } from './list-trash-entries.use-case.js';

/** The entry of CAD-490, deleted from Bugs after CAD-482. */
const BUGS_ENTRY: string = '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e06';

/** When CAD-490 went to the trash, after CAD-482. */
const LATER: Date = new Date('2026-11-07T09:00:00.000Z');

/** Camille Martin, the actor of the specs. */
const camille = { type: 'user', id: CAMILLE } as const;

/**
 * Builds the page of the trash of Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function page(overrides: Partial<ListTrashEntriesInput> = {}): ListTrashEntriesInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    after: null,
    limit: 50,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord with CAD-482 deleted from Sprint 14 and CAD-490 from Bugs.
 *
 * @param spaces - The fake spaces.
 * @param bugs - What replaces the entry of CAD-490.
 * @returns The fake store and the use case.
 */
function atelierNord(
  spaces: InMemorySpaceDirectory = new InMemorySpaceDirectory(),
  bugs: Partial<StoredTrashEntry> = {},
): { readonly tasks: InMemoryTasks; readonly useCase: ListTrashEntries } {
  const tasks = new InMemoryTasks({
    tasks: [
      taskState({ trash: trashIn(), version: 13 }),
      cad490State({ listId: BUGS, trash: trashIn(BUGS_ENTRY), version: 2 }),
    ],
    trashEntries: [
      storedEntry({ taskCount: 3 }),
      storedEntry({
        id: BUGS_ENTRY,
        rootTaskId: CAD_490,
        listId: BUGS,
        parentKey: 'CAD-482',
        taskCount: 1,
        trashedAt: LATER,
        trashedBy: { type: 'user', id: HUGO },
        ...bugs,
      }),
    ],
  });
  return { tasks, useCase: new ListTrashEntries(tasks, atelierNordMembers(), spaces) };
}

describe('ListTrashEntries: the trash of the actor, the most recently deleted first', () => {
  it('lists the entries with their root, parent, subtasks, list, author and purge instant', async () => {
    const { useCase } = atelierNord();

    const result = await useCase.execute(page());

    expect(result).toEqual({
      items: [
        {
          id: BUGS_ENTRY,
          task: { key: 'CAD-490', name: 'Page des quotas d’organisation', status: 'todo' },
          parentKey: 'CAD-482',
          subtaskCount: 0,
          list: { id: BUGS, spaceId: PRODUIT, name: 'Bugs', state: 'active' },
          trashedAt: LATER,
          trashedBy: { type: 'user', id: HUGO },
          purgeAt: new Date('2026-12-07T09:00:00.000Z'),
        },
        expect.objectContaining({
          id: CAD_482_ENTRY,
          subtaskCount: 2,
          trashedAt: TRASHED_AT,
          purgeAt: new Date('2026-12-06T16:20:00.000Z'),
        }),
      ],
      next: null,
      total: 2,
    });
  });

  it('pages after the deletion instant and the id of the last entry, with the total on every page', async () => {
    const { useCase } = atelierNord();

    const first = await useCase.execute(page({ limit: 1 }));
    const second = await useCase.execute(page({ limit: 1, after: first.next }));

    expect(first).toMatchObject({ items: [{ id: BUGS_ENTRY }], total: 2 });
    expect(first.next).toEqual({ trashedAt: LATER, id: BUGS_ENTRY });
    expect(second).toMatchObject({ items: [{ id: CAD_482_ENTRY }], next: null, total: 2 });
  });

  it('reads the list as deleted or archived, the entries of a deleted list included as if not', async () => {
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({ archivedAt: TRASHED_AT, archivedBy: camille }),
      deletedLists: { [BUGS]: camille },
    });
    const { useCase } = atelierNord(spaces);

    const result = await useCase.execute(page());

    expect(result.items.map((item) => [item.list.id, item.list.state])).toEqual([
      [BUGS, 'deleted'],
      [SPRINT_14, 'archived'],
    ]);
  });

  it('leaves out the entries handed to the purge and those of lists the actor could not change', async () => {
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({ organizationAccess: false }),
      listGrants: { [SPRINT_14]: { [LEA]: 'view' } },
    });
    const { useCase } = atelierNord(spaces, { purgeRequest: { at: NOW, by: camille } });

    expect(await useCase.execute(page({ actorUserId: LEA }))).toEqual({
      items: [],
      next: null,
      total: 0,
    });
  });

  it('answers an empty page without reading the entries to an actor with edit on no list', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ trace });
    const useCase = new ListTrashEntries(
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace, listGrants: { [MAQUETTES]: { [NADIA]: 'view' } } }),
    );

    expect(await useCase.execute(page({ actorUserId: NADIA }))).toEqual({
      items: [],
      next: null,
      total: 0,
    });
    expect(trace).not.toContain('trash.pageOfLists');
  });

  it('reads in one read-only snapshot, and refuses an actor the copy does not hold', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(page());

    expect(tasks.snapshotRuns).toBe(1);
    expect(await refusalOf(useCase.execute(page({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});
