import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DELETED_AT,
  DESIGN,
  InMemorySpaces,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  backlogState,
  designState,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { LockDeletedLists } from './lock-deleted-lists.use-case.js';

/** Who deleted the lists in these specs. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/** "Maquettes", a list of the space "Design", with a higher id than Sprint 14. */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Atelier Nord: "Design", created before "Produit" though its id is higher, holds the deleted
 * archived list "Maquettes"; "Produit" holds the deleted Sprint 14 and the live Backlog.
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
  });
}

describe('LockDeletedLists: the deleted lists are locked in the one order of the module, before an erasure', () => {
  it('reads the lists in one statement, then locks the spaces of the deleted ones in creation order and those lists for update in ascending id', async () => {
    const spaces = atelierNord();

    const output = await new LockDeletedLists(spaces).execute({
      organizationId: ATELIER_NORD,
      listIds: [MAQUETTES, UNKNOWN_LIST, SPRINT_14, BACKLOG, SPRINT_14],
    });

    expect(output).toEqual({
      lists: [
        { listId: MAQUETTES, outcome: 'deleted' },
        { listId: UNKNOWN_LIST, outcome: 'not-found' },
        { listId: SPRINT_14, outcome: 'deleted' },
        { listId: BACKLOG, outcome: 'live' },
      ],
    });
    expect(spaces.reads).toEqual(['lists']);
    expect(spaces.journal).toEqual([
      `space ${DESIGN}`,
      `space ${PRODUIT}`,
      `list ${SPRINT_14} delete`,
      `list ${MAQUETTES} delete`,
    ]);
  });

  it('locks a space once for several of its deleted lists', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
        backlogState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      ],
    });

    await new LockDeletedLists(spaces).execute({
      organizationId: ATELIER_NORD,
      listIds: [SPRINT_14, BACKLOG],
    });

    expect(spaces.journal).toEqual([
      `space ${PRODUIT}`,
      `list ${BACKLOG} delete`,
      `list ${SPRINT_14} delete`,
    ]);
  });

  it('takes no lock when no list given is deleted: live, archived, unknown or of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE }), backlogState()],
    });

    const output = await new LockDeletedLists(spaces).execute({
      organizationId: ATELIER_NORD,
      listIds: [SPRINT_14, BACKLOG, UNKNOWN_LIST],
    });
    const elsewhere = await new LockDeletedLists(atelierNord()).execute({
      organizationId: OTHER_ORGANIZATION,
      listIds: [SPRINT_14],
    });

    expect(output.lists.map((list) => list.outcome)).toEqual(['live', 'live', 'not-found']);
    expect(elsewhere).toEqual({ lists: [{ listId: SPRINT_14, outcome: 'not-found' }] });
    expect(spaces.journal).toEqual([]);
  });

  it('reads the deleted lists again under the lock: live once restored, not-found once erased meanwhile', async () => {
    const seeded = atelierNord();
    /** A unit of work whose lock of the lists finds Sprint 14 restored and Maquettes erased. */
    const unitOfWork: SpacesUnitOfWork = {
      run: (work) =>
        seeded.run((store) =>
          work({
            ...store,
            lists: {
              ...store.lists,
              lockMany: () =>
                Promise.resolve([
                  TaskList.restore(sprintState({ restoredAt: DELETED_AT, version: 2 })),
                ]),
            },
          }),
        ),
    };

    const output = await new LockDeletedLists(unitOfWork).execute({
      organizationId: ATELIER_NORD,
      listIds: [SPRINT_14, MAQUETTES],
    });

    expect(output).toEqual({
      lists: [
        { listId: SPRINT_14, outcome: 'live' },
        { listId: MAQUETTES, outcome: 'not-found' },
      ],
    });
  });

  it('answers no list without a transaction, and writes nothing', async () => {
    const spaces = atelierNord();

    expect(
      await new LockDeletedLists(spaces).execute({ organizationId: ATELIER_NORD, listIds: [] }),
    ).toEqual({ lists: [] });
    await new LockDeletedLists(spaces).execute({
      organizationId: ATELIER_NORD,
      listIds: [SPRINT_14],
    });

    expect(spaces.runs).toBe(1);
    expect(spaces.lists.get(SPRINT_14)?.deletedAt).toEqual(DELETED_AT);
    expect(spaces.events).toEqual([]);
  });

  it('throws for more than 100 lists, before any statement', async () => {
    const spaces = atelierNord();
    const listIds: string[] = Array.from(
      { length: 101 },
      (_unused: unknown, index: number) =>
        `019a7100-0000-7000-8000-${String(1000 + index).padStart(12, '0')}`,
    );

    await expect(
      new LockDeletedLists(spaces).execute({ organizationId: ATELIER_NORD, listIds }),
    ).rejects.toThrow('LockDeletedLists takes 100 lists at most.');
    expect(spaces.runs).toBe(0);
    expect(
      (
        await new LockDeletedLists(spaces).execute({
          organizationId: ATELIER_NORD,
          listIds: listIds.slice(0, 100),
        })
      ).lists,
    ).toHaveLength(100);
  });
});
