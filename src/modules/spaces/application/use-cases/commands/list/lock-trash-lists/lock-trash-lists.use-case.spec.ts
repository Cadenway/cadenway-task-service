import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DELETED_AT,
  DESIGN,
  INES,
  InMemorySpaces,
  LEA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  backlogState,
  designState,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TrashListAccess } from '../../../../models/list/trash-list-access.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { LockTrashListsInput } from './lock-trash-lists.input.js';
import { LockTrashLists } from './lock-trash-lists.use-case.js';

/** Who deleted the lists in these specs. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/** "Maquettes", a list of the space "Design", with a higher id than Sprint 14. */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** Léa Petit, a member of Atelier Nord. */
const LEA_MEMBER = { userId: LEA, role: 'member' } as const;

/**
 * Atelier Nord: "Design", private, created before "Produit" though its id is higher, holds the
 * deleted archived list "Maquettes" and is shared with Inès Robert for comment; "Produit" holds the
 * deleted Sprint 14 and the live Backlog.
 *
 * @returns The fake store.
 */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState({ createdAt: new Date('2026-09-01T08:00:00Z') })],
    lists: [
      sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      backlogState(),
      backlogState({
        id: MAQUETTES,
        spaceId: DESIGN,
        name: 'Maquettes',
        archivedAt: ARCHIVED_AT,
        archivedBy: BY_CAMILLE,
        deletedAt: DELETED_AT,
        deletedBy: BY_CAMILLE,
      }),
    ],
    grants: [spaceGrantOf(DESIGN, INES, 'comment')],
  });
}

/**
 * Builds the locking of some lists of Atelier Nord, in `erase` and without a viewer by default.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function lockOf(overrides: Partial<LockTrashListsInput> = {}): LockTrashListsInput {
  return {
    organizationId: ATELIER_NORD,
    listIds: [SPRINT_14],
    mode: 'erase',
    viewer: null,
    ...overrides,
  };
}

/**
 * A unit of work over the fake whose locks and role readings also write to one trace, so that a
 * spec reads the order of the two.
 *
 * @param seeded - The fake store.
 * @param trace - The trace the store writes to.
 * @returns The unit of work.
 */
function traced(seeded: InMemorySpaces, trace: string[]): SpacesUnitOfWork {
  return {
    run: <TResult>(work: (store: SpacesStore) => Promise<TResult>): Promise<TResult> =>
      seeded.run((store: SpacesStore) =>
        work({
          ...store,
          spaces: {
            ...store.spaces,
            lockInOrder: (organizationId, locks) => {
              trace.push('lock spaces');
              return store.spaces.lockInOrder(organizationId, locks);
            },
          },
          lists: {
            ...store.lists,
            lockMany: (organizationId, ids, mode) => {
              trace.push('lock lists');
              return store.lists.lockMany(organizationId, ids, mode);
            },
            findTrashAccessVisibleTo: (
              organizationId: string,
              viewer: Viewer,
              id: string,
            ): Promise<TrashListAccess | null> => {
              trace.push('read role');
              return store.lists.findTrashAccessVisibleTo(organizationId, viewer, id);
            },
            listTrashAccessesVisibleTo: (
              organizationId: string,
              viewer: Viewer,
            ): Promise<TrashListAccess[]> => {
              trace.push('read roles');
              return store.lists.listTrashAccessesVisibleTo(organizationId, viewer);
            },
          },
        }),
      ),
  };
}

describe('LockTrashLists: the lists of trash entries are locked spaces first, live or deleted, in the one order of the module', () => {
  it('erase: reads the lists in one statement, then locks their spaces for no key update in creation order and every list found for update in ascending id', async () => {
    const spaces = atelierNord();

    const output = await new LockTrashLists(spaces).execute(
      lockOf({ listIds: [MAQUETTES, UNKNOWN_LIST, SPRINT_14, BACKLOG, SPRINT_14] }),
    );

    expect(output).toEqual({
      lists: [
        { listId: MAQUETTES, outcome: 'deleted', role: null },
        { listId: UNKNOWN_LIST, outcome: 'not-found', role: null },
        { listId: SPRINT_14, outcome: 'deleted', role: null },
        { listId: BACKLOG, outcome: 'live', role: null },
      ],
    });
    expect(spaces.reads).toEqual(['lists']);
    expect(spaces.journal).toEqual([
      `space ${DESIGN}`,
      `space ${PRODUIT}`,
      `list ${BACKLOG} delete`,
      `list ${SPRINT_14} delete`,
      `list ${MAQUETTES} delete`,
    ]);
  });

  it('hold: locks the spaces then the lists for share, in the same order', async () => {
    const spaces = atelierNord();

    await new LockTrashLists(spaces).execute(
      lockOf({ mode: 'hold', listIds: [MAQUETTES, SPRINT_14, BACKLOG] }),
    );

    expect(spaces.journal).toEqual([
      `space ${DESIGN} share`,
      `space ${PRODUIT} share`,
      `list ${BACKLOG} share`,
      `list ${SPRINT_14} share`,
      `list ${MAQUETTES} share`,
    ]);
  });

  it('holds an additional space in the same order before locking any linked list', async () => {
    const spaces = atelierNord();
    await new LockTrashLists(spaces).execute(
      lockOf({ mode: 'hold', listIds: [BACKLOG], additionalSpaceIds: [DESIGN] }),
    );
    expect(spaces.journal).toEqual([
      `space ${DESIGN} share`,
      `space ${PRODUIT} share`,
      `list ${BACKLOG} share`,
    ]);
  });

  it('holds the additional space even when there are no linked lists', async () => {
    const spaces = atelierNord();
    await new LockTrashLists(spaces).execute(
      lockOf({ mode: 'hold', listIds: [], additionalSpaceIds: [DESIGN] }),
    );
    expect(spaces.journal).toEqual([`space ${DESIGN} share`]);
  });

  it('locks a live list as a deleted one, and a space once for several of its lists', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE }), backlogState()],
    });

    const output = await new LockTrashLists(spaces).execute(
      lockOf({ listIds: [SPRINT_14, BACKLOG] }),
    );

    expect(output.lists.map((list) => list.outcome)).toEqual(['live', 'live']);
    expect(spaces.journal).toEqual([
      `space ${PRODUIT}`,
      `list ${BACKLOG} delete`,
      `list ${SPRINT_14} delete`,
    ]);
  });

  it('takes no lock for an unknown list or a list of another organization', async () => {
    const spaces = atelierNord();

    const output = await new LockTrashLists(spaces).execute(
      lockOf({ organizationId: OTHER_ORGANIZATION, listIds: [SPRINT_14, UNKNOWN_LIST] }),
    );

    expect(output).toEqual({
      lists: [
        { listId: SPRINT_14, outcome: 'not-found', role: null },
        { listId: UNKNOWN_LIST, outcome: 'not-found', role: null },
      ],
    });
    expect(spaces.journal).toEqual([]);
  });

  it('reads where each list stands under the lock: live once restored, deleted once deleted, not-found once erased meanwhile', async () => {
    const seeded = atelierNord();
    /** A unit of work whose lock of the lists finds Sprint 14 restored, Backlog deleted and Maquettes erased. */
    const unitOfWork: SpacesUnitOfWork = {
      run: (work) =>
        seeded.run((store) =>
          work({
            ...store,
            lists: {
              ...store.lists,
              lockMany: () =>
                Promise.resolve([
                  TaskList.restore(backlogState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })),
                  TaskList.restore(sprintState({ restoredAt: DELETED_AT, version: 2 })),
                ]),
            },
          }),
        ),
    };

    const output = await new LockTrashLists(unitOfWork).execute(
      lockOf({ listIds: [SPRINT_14, BACKLOG, MAQUETTES] }),
    );

    expect(output).toEqual({
      lists: [
        { listId: SPRINT_14, outcome: 'live', role: null },
        { listId: BACKLOG, outcome: 'deleted', role: null },
        { listId: MAQUETTES, outcome: 'not-found', role: null },
      ],
    });
  });

  it('answers no list without a transaction, and writes nothing', async () => {
    const spaces = atelierNord();

    expect(await new LockTrashLists(spaces).execute(lockOf({ listIds: [] }))).toEqual({
      lists: [],
    });
    await new LockTrashLists(spaces).execute(lockOf());

    expect(spaces.runs).toBe(1);
    expect(spaces.lists.get(SPRINT_14)?.deletedAt).toEqual(DELETED_AT);
    expect(spaces.events).toEqual([]);
  });

  it('takes more than 100 lists in one call, without a cap', async () => {
    const spaces = atelierNord();
    const listIds: string[] = Array.from(
      { length: 101 },
      (_unused: unknown, index: number) =>
        `019a7100-0000-7000-8000-${String(1000 + index).padStart(12, '0')}`,
    );

    const output = await new LockTrashLists(spaces).execute(lockOf({ listIds }));

    expect(output.lists).toHaveLength(101);
    expect(spaces.runs).toBe(1);
  });
});

describe('LockTrashLists: the role of the viewer is read again under the locks, as if not deleted', () => {
  it('reads the role of one list after the locks, by its id', async () => {
    const seeded = atelierNord();
    const trace: string[] = [];

    const output = await new LockTrashLists(traced(seeded, trace)).execute(
      lockOf({ viewer: LEA_MEMBER }),
    );

    expect(output).toEqual({ lists: [{ listId: SPRINT_14, outcome: 'deleted', role: 'edit' }] });
    expect(trace).toEqual(['lock spaces', 'lock lists', 'read role']);
    expect(seeded.reads).toEqual(['lists', 'trash access']);
  });

  it('reads the roles of several lists after the locks, in one statement, keeping the lists given', async () => {
    const seeded = atelierNord();
    const trace: string[] = [];

    const output = await new LockTrashLists(traced(seeded, trace)).execute(
      lockOf({ mode: 'hold', listIds: [MAQUETTES, SPRINT_14], viewer: LEA_MEMBER }),
    );
    const ofInes = await new LockTrashLists(atelierNord()).execute(
      lockOf({ listIds: [MAQUETTES, SPRINT_14], viewer: { userId: INES, role: 'member' } }),
    );

    expect(output).toEqual({
      lists: [
        { listId: MAQUETTES, outcome: 'deleted', role: null },
        { listId: SPRINT_14, outcome: 'deleted', role: 'edit' },
      ],
    });
    expect(ofInes.lists.map((list) => list.role)).toEqual(['comment', 'edit']);
    expect(trace).toEqual(['lock spaces', 'lock lists', 'read roles']);
    expect(seeded.reads).toEqual(['lists', 'trash accesses']);
  });

  it('answers the role of a grant revoked meanwhile as it stands under the locks', async () => {
    const spaces = atelierNord();
    spaces.grants = [];

    const output = await new LockTrashLists(spaces).execute(
      lockOf({ listIds: [MAQUETTES], viewer: { userId: INES, role: 'member' } }),
    );

    expect(output).toEqual({ lists: [{ listId: MAQUETTES, outcome: 'deleted', role: null }] });
  });

  it('reads no role without a viewer, nor for a list not found', async () => {
    const spaces = atelierNord();

    const output = await new LockTrashLists(atelierNord()).execute(
      lockOf({ listIds: [UNKNOWN_LIST], viewer: LEA_MEMBER }),
    );
    const forTheService = await new LockTrashLists(spaces).execute(
      lockOf({ listIds: [SPRINT_14, BACKLOG] }),
    );

    expect(output).toEqual({ lists: [{ listId: UNKNOWN_LIST, outcome: 'not-found', role: null }] });
    expect(forTheService.lists.map((list) => list.role)).toEqual([null, null]);
    expect(spaces.reads).toEqual(['lists']);
  });
});
