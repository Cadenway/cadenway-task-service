import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DELETED_AT,
  DESIGN,
  HUGO,
  InMemorySpaces,
  LEA,
  MARKETING,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  TRANSACTION_INSTANT,
  UNKNOWN_LIST,
  atelierNordMembers,
  backlogState,
  designState,
  listGrantOf,
  marketingState,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { ListSpaces } from '../../../queries/space/list-spaces/list-spaces.use-case.js';
import { GetList } from '../../../queries/list/get-list/get-list.use-case.js';
import type { RestoreDeletedListInput } from './restore-deleted-list.input.js';
import { RestoreDeletedList } from './restore-deleted-list.use-case.js';

/** Who deleted the list or the space in these specs. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/**
 * Builds the restoration of the list of an entry of Sprint 14 by Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function restoreSprint(overrides: Partial<RestoreDeletedListInput> = {}): RestoreDeletedListInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    viewerRole: 'member',
    listId: SPRINT_14,
    ...overrides,
  };
}

/** "Produit" deleted with its lists: Backlog and Sprint 14 (version 3) kept their versions. */
function produitDeleted(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [
      spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE, version: 6 }),
      marketingState(),
    ],
    lists: [
      backlogState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE, version: 3 }),
    ],
  });
}

describe('RestoreDeletedList: a deleted list comes back with a restored entry', () => {
  it('brings back a list deleted on its own at the end of its space, at the next version', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        backlogState(),
        sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE, version: 4 }),
      ],
    });

    const outcome = await new RestoreDeletedList(spaces).execute(restoreSprint());

    expect(outcome).toEqual({ outcome: 'restored', listRestored: true, spaceRestored: false });
    expect(spaces.lists.get(SPRINT_14)).toEqual(
      sprintState({ restoredAt: TRANSACTION_INSTANT, version: 5 }),
    );
    expect(spaces.events).toEqual([
      {
        kind: 'listRestored',
        listId: SPRINT_14,
        version: 5,
        restoredAt: TRANSACTION_INSTANT,
        archivedAt: null,
        actor: { type: 'user', id: LEA },
      },
    ]);
  });

  it('brings back the deleted space first, then the list, without its other lists', async () => {
    const spaces = produitDeleted();

    const outcome = await new RestoreDeletedList(spaces).execute(restoreSprint());

    expect(outcome).toEqual({ outcome: 'restored', listRestored: true, spaceRestored: true });
    expect(spaces.spaces.get(PRODUIT)).toEqual(
      spaceState({ restoredAt: TRANSACTION_INSTANT, version: 7 }),
    );
    expect(spaces.lists.get(SPRINT_14)).toMatchObject({ deletedAt: null, version: 4 });
    expect(spaces.lists.get(BACKLOG)?.deletedAt).toEqual(DELETED_AT);
    expect(spaces.events.map((event) => event.kind)).toEqual(['spaceRestored', 'listRestored']);
    expect(spaces.events[0]).toEqual({
      kind: 'spaceRestored',
      spaceId: PRODUIT,
      version: 7,
      restoredAt: TRANSACTION_INSTANT,
      actor: { type: 'user', id: LEA },
    });
  });

  it('puts the restored space at the end of the sidebar', async () => {
    const spaces = produitDeleted();
    await new RestoreDeletedList(spaces).execute(restoreSprint());

    const page = await new ListSpaces(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
      actorUserId: LEA,
      after: null,
      limit: 50,
    });

    expect(page.items.map((view) => view.space.id)).toEqual([MARKETING, PRODUIT]);
  });

  it('brings back live a list archived before its deletion', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState({
          archivedAt: ARCHIVED_AT,
          archivedBy: BY_CAMILLE,
          deletedAt: DELETED_AT,
          deletedBy: BY_CAMILLE,
          version: 5,
        }),
      ],
    });

    await new RestoreDeletedList(spaces).execute(restoreSprint());

    expect(spaces.lists.get(SPRINT_14)).toMatchObject({ archivedAt: null, deletedAt: null });
  });

  it('leaves a live list of a live space as it is, an archived one included, and writes nothing', async () => {
    const archived = sprintState({ archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE, version: 4 });
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [archived] });

    const outcome = await new RestoreDeletedList(spaces).execute(restoreSprint());

    expect(outcome).toEqual({ outcome: 'restored', listRestored: false, spaceRestored: false });
    expect(spaces.lists.get(SPRINT_14)).toEqual(archived);
    expect(spaces.events).toEqual([]);
    expect(spaces.clockReads).toBe(0);
  });

  it('makes the list readable again, with the role of the member', async () => {
    const spaces = produitDeleted();
    await new RestoreDeletedList(spaces).execute(restoreSprint());

    const view = await new GetList(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
      actorUserId: LEA,
      listId: SPRINT_14,
    });

    expect(view.callerRole).toBe('edit');
  });
});

describe('RestoreDeletedList: the role as if not deleted decides, on the locked rows', () => {
  it('gives the owner of a deleted private space the role they would have, edit', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: HUGO } })],
      lists: [
        backlogState({
          id: SPRINT_14,
          spaceId: DESIGN,
          deletedAt: DELETED_AT,
          deletedBy: { type: 'user', id: HUGO },
        }),
      ],
    });

    const outcome = await new RestoreDeletedList(spaces).execute(
      restoreSprint({ actorUserId: HUGO }),
    );

    expect(outcome).toEqual({ outcome: 'restored', listRestored: true, spaceRestored: true });
  });

  it('counts the grants the tombstone kept', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      lists: [
        sprintState({ organizationAccess: false, deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      ],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit')],
    });

    const outcome = await new RestoreDeletedList(spaces).execute(
      restoreSprint({ actorUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(outcome).toEqual({ outcome: 'restored', listRestored: true, spaceRestored: true });
  });

  it.each([['comment'], ['view']] as const)(
    'refuses role-insufficient with the role %s it would have, and writes nothing',
    async (role: 'comment' | 'view') => {
      const spaces = new InMemorySpaces({
        spaces: [designState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: HUGO } })],
        lists: [
          backlogState({
            id: SPRINT_14,
            spaceId: DESIGN,
            deletedAt: DELETED_AT,
            deletedBy: { type: 'user', id: HUGO },
          }),
        ],
        grants: [spaceGrantOf(DESIGN, LEA, role)],
      });

      const outcome = await new RestoreDeletedList(spaces).execute(restoreSprint());

      expect(outcome).toEqual({ outcome: 'role-insufficient', role });
      expect(spaces.spaces.get(DESIGN)?.deletedAt).toEqual(DELETED_AT);
      expect(spaces.events).toEqual([]);
    },
  );

  it.each([
    [
      'a list the member would have no role on',
      restoreSprint({ actorUserId: LEA, listId: SPRINT_14 }),
      true,
    ],
    ['a list that does not exist, or was erased', restoreSprint({ listId: UNKNOWN_LIST }), false],
  ])(
    'answers not-found for %s',
    async (_why: string, input: RestoreDeletedListInput, privateSpace: boolean) => {
      const spaces = privateSpace
        ? new InMemorySpaces({
            spaces: [designState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: HUGO } })],
            lists: [
              backlogState({
                id: SPRINT_14,
                spaceId: DESIGN,
                deletedAt: DELETED_AT,
                deletedBy: { type: 'user', id: HUGO },
              }),
            ],
          })
        : produitDeleted();

      expect(await new RestoreDeletedList(spaces).execute(input)).toEqual({ outcome: 'not-found' });
      expect(spaces.events).toEqual([]);
    },
  );

  it('answers not-found for a list of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [
        sprintState({
          organizationId: OTHER_ORGANIZATION,
          deletedAt: DELETED_AT,
          deletedBy: BY_CAMILLE,
        }),
      ],
    });

    expect(await new RestoreDeletedList(spaces).execute(restoreSprint())).toEqual({
      outcome: 'not-found',
    });
  });

  it('reads the list without lock, then locks the space, then the list', async () => {
    const spaces = produitDeleted();

    await new RestoreDeletedList(spaces).execute(restoreSprint());

    expect(spaces.reads[0]).toBe('list');
    expect(spaces.journal).toEqual([`space ${PRODUIT}`, `list ${SPRINT_14}`]);
  });
});
