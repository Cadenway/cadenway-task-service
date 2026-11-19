import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DELETED_AT,
  InMemorySpaces,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  backlogState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { PurgeDeletedListInput } from './purge-deleted-list.input.js';
import { PurgeDeletedList } from './purge-deleted-list.use-case.js';

/** Who deleted the list or the space in these specs. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/**
 * Builds the erasure of Sprint 14.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function purgeSprint(overrides: Partial<PurgeDeletedListInput> = {}): PurgeDeletedListInput {
  return { organizationId: ATELIER_NORD, listId: SPRINT_14, ...overrides };
}

describe('PurgeDeletedList: a deleted list is erased with the last of its entries', () => {
  it('erases a list deleted on its own and its grants, and leaves its live space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      grants: [
        listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit'),
        spaceGrantOf(PRODUIT, NADIA, 'view'),
      ],
    });

    const outcome = await new PurgeDeletedList(spaces).execute(purgeSprint());

    expect(outcome).toEqual({ outcome: 'purged', spacePurged: false });
    expect(spaces.lists.has(SPRINT_14)).toBe(false);
    expect(spaces.lists.has(BACKLOG)).toBe(true);
    expect(spaces.spaces.has(PRODUIT)).toBe(true);
    expect(spaces.grantsOf({ kind: 'list', spaceId: PRODUIT, listId: SPRINT_14 })).toEqual([]);
    expect(spaces.grantsOf({ kind: 'space', spaceId: PRODUIT })).toEqual([
      { userId: NADIA, role: 'view' },
    ]);
    expect(spaces.events).toEqual([]);
  });

  it('erases the deleted space and its grants with its last list, its prefix kept', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      grants: [spaceGrantOf(PRODUIT, NADIA, 'view')],
    });

    const outcome = await new PurgeDeletedList(spaces).execute(purgeSprint());

    expect(outcome).toEqual({ outcome: 'purged', spacePurged: true });
    expect(spaces.spaces.has(PRODUIT)).toBe(false);
    expect(spaces.grants).toEqual([]);
    expect(spaces.prefixOwners.get(`${ATELIER_NORD}/CAD`)).toBe(PRODUIT);
  });

  it('keeps the deleted space while another list row of it is left', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      lists: [
        backlogState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
        sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      ],
    });

    const outcome = await new PurgeDeletedList(spaces).execute(purgeSprint());

    expect(outcome).toEqual({ outcome: 'purged', spacePurged: false });
    expect(spaces.spaces.has(PRODUIT)).toBe(true);
  });

  it('locks the list for an erasure, then the deleted space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    await new PurgeDeletedList(spaces).execute(purgeSprint());

    expect(spaces.journal).toEqual([`list ${SPRINT_14} delete`, `space ${PRODUIT} delete`]);
  });

  it('never locks a live space for an erasure', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    await new PurgeDeletedList(spaces).execute(purgeSprint());

    expect(spaces.journal).toEqual([`list ${SPRINT_14} delete`]);
  });
});

describe('PurgeDeletedList: a live or unknown list is left alone', () => {
  it('answers not-deleted for a live list and writes nothing', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    expect(await new PurgeDeletedList(spaces).execute(purgeSprint())).toEqual({
      outcome: 'not-deleted',
    });
    expect(spaces.lists.has(SPRINT_14)).toBe(true);
  });

  it.each([
    ['a list that does not exist, or was erased', { listId: UNKNOWN_LIST }],
    ['a list of another organization', { organizationId: OTHER_ORGANIZATION }],
  ])(
    'answers not-found for %s',
    async (_why: string, overrides: Partial<PurgeDeletedListInput>) => {
      const spaces = new InMemorySpaces({
        spaces: [spaceState()],
        lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      });

      expect(await new PurgeDeletedList(spaces).execute(purgeSprint(overrides))).toEqual({
        outcome: 'not-found',
      });
      expect(spaces.lists.has(SPRINT_14)).toBe(true);
    },
  );
});

describe('PurgeDeletedList: a list is read without lock first, and only a deleted one is locked', () => {
  it('reads a live list without locking it', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    await new PurgeDeletedList(spaces).execute(purgeSprint());

    expect(spaces.reads).toEqual(['list']);
    expect(spaces.journal).toEqual([]);
  });

  it('reads the deleted list, locks it, then reads its space before locking it', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    await new PurgeDeletedList(spaces).execute(purgeSprint());

    expect(spaces.reads).toEqual(['list', 'space']);
    expect(spaces.journal).toEqual([`list ${SPRINT_14} delete`, `space ${PRODUIT} delete`]);
  });
});
