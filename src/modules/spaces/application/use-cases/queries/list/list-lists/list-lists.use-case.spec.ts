import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
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
  listGrantOf,
  marketingState,
  refusalOf,
  spaceGrantOf,
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

    expect(page.items).toEqual([
      { list: backlogState(), callerRole: 'edit' },
      { list: sprintState(), callerRole: 'edit' },
    ]);
    expect(page.next).toBeNull();
  });

  it('leaves out the lists of the other spaces', async () => {
    const page = await new ListLists(atelierNord(), atelierNordMembers()).execute(
      listProduit({ spaceId: MARKETING }),
    );

    expect(page.items.map((item) => item.list.id)).toEqual([CAMPAGNES]);
  });

  it('lists the lists of a private space to its owner', async () => {
    const page = await new ListLists(atelierNord(), atelierNordMembers()).execute(
      listProduit({ actorUserId: HUGO, spaceId: DESIGN }),
    );

    expect(page.items.map((item) => item.list.id)).toEqual([MAQUETTES]);
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
    expect(page.items.map((item) => item.list.id)).toEqual([BACKLOG]);
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

    expect(second.items.map((item) => item.list.id)).toEqual([SPRINT_14]);
    expect(second.next).toBeNull();
  });
});

describe('ListLists: an archived list leaves the lists of its space, a restored one comes last', () => {
  /** When Backlog came back from the archives in these specs. */
  const RESTORED_AT: Date = new Date('2026-11-08T17:00:00Z');

  /**
   * Atelier Nord with Sprint 14 archived, or with Backlog restored after Sprint 14 was created.
   *
   * @param archived - Whether Sprint 14 is archived.
   * @param restored - Whether Backlog came back from the archives.
   * @returns The fake store.
   */
  function produit(archived: boolean, restored: boolean): InMemorySpaces {
    return new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState(
          archived ? { archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: CAMILLE } } : {},
        ),
        backlogState(restored ? { restoredAt: RESTORED_AT } : {}),
      ],
    });
  }

  it('leaves an archived list out of the page', async () => {
    const page = await new ListLists(produit(true, false), atelierNordMembers()).execute(
      listProduit(),
    );

    expect(page.items.map((item) => item.list.id)).toEqual([BACKLOG]);
  });

  it('puts a restored list after the lists created before its restoration', async () => {
    const page = await new ListLists(produit(false, true), atelierNordMembers()).execute(
      listProduit(),
    );

    expect(page.items.map((item) => item.list.id)).toEqual([SPRINT_14, BACKLOG]);
  });

  it('continues across a restored list, and nothing follows its restoration', async () => {
    const list = new ListLists(produit(false, true), atelierNordMembers());

    const first = await list.execute(listProduit({ limit: 1 }));
    const second = await list.execute(listProduit({ limit: 1, after: first.next }));
    const after = await list.execute(
      listProduit({ limit: 1, after: { createdAt: RESTORED_AT, id: BACKLOG } }),
    );

    expect(first.next).toEqual({ createdAt: sprintState().createdAt, id: SPRINT_14 });
    expect(second.items.map((item) => item.list.id)).toEqual([BACKLOG]);
    expect(after).toEqual({ items: [], next: null });
  });

  it('answers the restoration of the last list as the next position', async () => {
    const page = await new ListLists(
      new InMemorySpaces({
        spaces: [spaceState()],
        lists: [
          backlogState({ restoredAt: RESTORED_AT }),
          sprintState({ createdAt: new Date('2026-11-09T09:00:00Z') }),
        ],
      }),
      atelierNordMembers(),
    ).execute(listProduit({ limit: 1 }));

    expect(page.items.map((item) => item.list.id)).toEqual([BACKLOG]);
    expect(page.next).toEqual({ createdAt: RESTORED_AT, id: BACKLOG });
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

describe('ListLists: only the lists the caller has a role on, each with that role', () => {
  it('lists to a guest the lists of the space shared with them, and nothing else of it', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), sprintState()],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'comment')],
    });

    const page = await new ListLists(spaces, atelierNordMembers()).execute(
      listProduit({ actorUserId: NADIA }),
    );

    expect(page.items).toEqual([{ list: sprintState(), callerRole: 'comment' }]);
  });

  it('leaves out of the page of a member a list whose switch is off, and keeps it for the owner', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), sprintState({ organizationAccess: false })],
    });
    const list = new ListLists(spaces, atelierNordMembers());

    const ofLea = await list.execute(listProduit());
    const ofCamille = await list.execute(listProduit({ actorUserId: CAMILLE }));

    expect(ofLea.items.map((item) => item.list.id)).toEqual([BACKLOG]);
    expect(ofCamille.items.map((item) => [item.list.id, item.callerRole])).toEqual([
      [BACKLOG, 'edit'],
      [SPRINT_14, 'edit'],
    ]);
  });

  it('gives every list of a private space the role of the grant of the space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' })],
      grants: [spaceGrantOf(DESIGN, LEA, 'view')],
    });

    const page = await new ListLists(spaces, atelierNordMembers()).execute(
      listProduit({ spaceId: DESIGN }),
    );

    expect(page.items.map((item) => [item.list.id, item.callerRole])).toEqual([
      [MAQUETTES, 'view'],
    ]);
  });
});
