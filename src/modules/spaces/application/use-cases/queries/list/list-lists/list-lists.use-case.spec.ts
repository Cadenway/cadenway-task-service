import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  MARKETING,
  NADIA,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  UNKNOWN_SPACE,
  atelierNordMembers,
  backlogState,
  designState,
  marketingState,
  refusalOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { ListListsInput } from './list-lists.input.js';
import { ListLists } from './list-lists.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** The list "Campagnes" of the space "Marketing". */
const CAMPAGNES = '019a7100-0000-7000-8000-000000000004';

/**
 * Builds the first page of the lists of "Produit" for Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function listProduit(overrides: Partial<ListListsInput> = {}): ListListsInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    spaceId: PRODUIT,
    after: null,
    limit: 50,
    ...overrides,
  };
}

/** Atelier Nord: Backlog and Sprint 14 in "Produit", one list in "Marketing" and one in the private "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState(), marketingState()],
    lists: [
      sprintState(),
      backlogState(),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
      backlogState({ id: CAMPAGNES, spaceId: MARKETING, name: 'Campagnes' }),
    ],
  });
}

describe('ListLists: the lists of a space the caller sees, in the order they were created', () => {
  it('lists Backlog then Sprint 14 for a member', async () => {
    const page = await new ListLists(atelierNord(), atelierNordMembers()).execute(listProduit());

    expect(page.items).toEqual([backlogState(), sprintState()]);
    expect(page.next).toBeNull();
  });

  it('leaves out the lists of the other spaces', async () => {
    const page = await new ListLists(atelierNord(), atelierNordMembers()).execute(
      listProduit({ spaceId: MARKETING }),
    );

    expect(page.items.map((list) => list.id)).toEqual([CAMPAGNES]);
  });

  it('lists the lists of a private space to its owner', async () => {
    const page = await new ListLists(atelierNord(), atelierNordMembers()).execute(
      listProduit({ actorUserId: HUGO, spaceId: DESIGN }),
    );

    expect(page.items.map((list) => list.id)).toEqual([MAQUETTES]);
  });

  it('is an empty page for a space with no list', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });

    const page = await new ListLists(spaces, atelierNordMembers()).execute(listProduit());

    expect(page).toEqual({ items: [], next: null });
  });
});

describe('ListLists: a page holds the limit, and limit + 1 rows are read to know there is a next', () => {
  it('reads limit + 1 lists and answers the limit with the position of the last one', async () => {
    const spaces = atelierNord();

    const page = await new ListLists(spaces, atelierNordMembers()).execute(
      listProduit({ limit: 1 }),
    );

    expect(spaces.listOfSpaceCalls).toEqual([{ spaceId: PRODUIT, after: null, limit: 2 }]);
    expect(page.items.map((list) => list.id)).toEqual([BACKLOG]);
    expect(page.next).toEqual({ createdAt: backlogState().createdAt, id: BACKLOG });
  });

  it('answers no next position when exactly the limit of lists remain', async () => {
    const page = await new ListLists(atelierNord(), atelierNordMembers()).execute(
      listProduit({ limit: 2 }),
    );

    expect(page.items).toHaveLength(2);
    expect(page.next).toBeNull();
  });

  it('continues after the position of the previous page', async () => {
    const list = new ListLists(atelierNord(), atelierNordMembers());
    const first = await list.execute(listProduit({ limit: 1 }));

    const second = await list.execute(listProduit({ limit: 1, after: first.next }));

    expect(second.items.map((item) => item.id)).toEqual([SPRINT_14]);
    expect(second.next).toBeNull();
  });
});

describe('ListLists: a space the caller does not see answers as an unknown one does', () => {
  it.each([
    ['the owner of the organization', CAMILLE],
    ['an admin', INES],
    ['another member', LEA],
  ])('hides the private Design from %s', async (_who: string, actorUserId: string) => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new ListLists(spaces, atelierNordMembers()).execute(
        listProduit({ actorUserId, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
    expect(spaces.listOfSpaceCalls).toEqual([]);
  });

  it('hides the lists of an organization space from a guest', async () => {
    const refusal = await refusalOf(
      new ListLists(atelierNord(), atelierNordMembers()).execute(
        listProduit({ actorUserId: NADIA }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers the same for a space that does not exist', async () => {
    const refusal = await refusalOf(
      new ListLists(atelierNord(), atelierNordMembers()).execute(
        listProduit({ spaceId: UNKNOWN_SPACE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new ListLists(atelierNord(), atelierNordMembers()).execute(
        listProduit({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('ListLists: a read does not lock the membership of the caller', () => {
  it('asks the directory for the role of the caller without the lock', async () => {
    const members = atelierNordMembers();

    await new ListLists(atelierNord(), members).execute(listProduit());

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: LEA, lock: false }]);
  });
});

describe('ListLists: the lists of a private space that awaits an owner are unknown to everyone', () => {
  it.each([
    ['its former owner', HUGO],
    ['the owner of the organization', CAMILLE],
  ])('hides them from %s', async (_who: string, actorUserId: string) => {
    const spaces = new InMemorySpaces({
      spaces: [designState({ awaitingOwner: true })],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN })],
    });

    const refusal = await refusalOf(
      new ListLists(spaces, atelierNordMembers()).execute(
        listProduit({ actorUserId, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });
});
