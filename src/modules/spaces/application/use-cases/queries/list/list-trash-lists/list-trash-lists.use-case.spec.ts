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
  backlogState,
  designState,
  listGrantOf,
  marketingState,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { ListTrashListsInput } from './list-trash-lists.input.js';
import { ListTrashLists } from './list-trash-lists.use-case.js';

/** A list of the private space "Design" of Hugo Dubois. */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** A list of "Marketing". */
const CAMPAGNES = '019a7100-0000-7000-8000-000000000004';

/** Who deleted a list or a space in these specs. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/**
 * Builds the reading of the trash lists of Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function trashOf(overrides: Partial<ListTrashListsInput> = {}): ListTrashListsInput {
  return { organizationId: ATELIER_NORD, viewerUserId: LEA, viewerRole: 'member', ...overrides };
}

/**
 * Atelier Nord: "Produit" deleted with Backlog and Sprint 14, "Marketing" live with an archived
 * "Campagnes", and the private "Design" of Hugo Dubois with "Maquettes" deleted on its own.
 *
 * @returns The fake store.
 */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [
      spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      marketingState(),
      designState(),
    ],
    lists: [
      backlogState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      backlogState({
        id: CAMPAGNES,
        spaceId: MARKETING,
        name: 'Campagnes',
        archivedAt: ARCHIVED_AT,
        archivedBy: BY_CAMILLE,
      }),
      backlogState({
        id: MAQUETTES,
        spaceId: DESIGN,
        name: 'Maquettes',
        deletedAt: DELETED_AT,
        deletedBy: { type: 'user', id: HUGO },
      }),
    ],
  });
}

describe('ListTrashLists: the lists whose entries a member may see, with the role as if not deleted', () => {
  it('reads every list a member has a role on, live, archived or deleted, with its state and role', async () => {
    const { lists } = await new ListTrashLists(atelierNord()).execute(trashOf());

    expect([...lists].sort((left, right) => left.list.id.localeCompare(right.list.id))).toEqual([
      { list: { id: BACKLOG, spaceId: PRODUIT, name: 'Backlog', state: 'deleted' }, role: 'edit' },
      {
        list: { id: SPRINT_14, spaceId: PRODUIT, name: 'Sprint 14', state: 'deleted' },
        role: 'edit',
      },
      {
        list: { id: CAMPAGNES, spaceId: MARKETING, name: 'Campagnes', state: 'archived' },
        role: 'edit',
      },
    ]);
  });

  it('gives the owner of a deleted list of a private space the role they would have', async () => {
    const { lists } = await new ListTrashLists(atelierNord()).execute(
      trashOf({ viewerUserId: HUGO }),
    );

    expect(lists.map((entry) => entry.list.id)).toContain(MAQUETTES);
  });

  it('counts the grants a tombstone kept, with the role each gives, and leaves the threshold to the caller', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: HUGO } })],
      lists: [
        backlogState({
          id: MAQUETTES,
          spaceId: DESIGN,
          deletedAt: DELETED_AT,
          deletedBy: BY_CAMILLE,
        }),
        sprintState({ spaceId: DESIGN, deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
      ],
      grants: [
        listGrantOf(DESIGN, MAQUETTES, NADIA, 'edit'),
        listGrantOf(DESIGN, SPRINT_14, NADIA, 'view'),
        spaceGrantOf(DESIGN, LEA, 'comment'),
      ],
    });

    const guest = await new ListTrashLists(spaces).execute(
      trashOf({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );
    const commenter = await new ListTrashLists(spaces).execute(trashOf());

    expect(
      [...guest.lists]
        .sort((left, right) => left.list.id.localeCompare(right.list.id))
        .map((entry) => [entry.list.id, entry.role]),
    ).toEqual([
      [SPRINT_14, 'view'],
      [MAQUETTES, 'edit'],
    ]);
    expect(commenter.lists.map((entry) => entry.role)).toEqual(['comment', 'comment']);
  });

  it('reads nothing for a space awaiting an owner, and nothing of another organization', async () => {
    const awaiting = new InMemorySpaces({
      spaces: [designState({ awaitingOwner: true })],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN })],
      grants: [listGrantOf(DESIGN, MAQUETTES, LEA, 'edit')],
    });

    expect((await new ListTrashLists(awaiting).execute(trashOf())).lists).toEqual([]);
    expect(
      (
        await new ListTrashLists(atelierNord()).execute(
          trashOf({ organizationId: OTHER_ORGANIZATION }),
        )
      ).lists,
    ).toEqual([]);
  });

  it('leaves out a list the member would have no role on', async () => {
    const { lists } = await new ListTrashLists(atelierNord()).execute(trashOf());

    expect(lists.map((entry) => entry.list.id)).not.toContain(MAQUETTES);
  });

  it('takes no lock and appends no event', async () => {
    const spaces = atelierNord();

    await new ListTrashLists(spaces).execute(trashOf());

    expect(spaces.journal).toEqual([]);
    expect(spaces.events).toEqual([]);
  });
});
