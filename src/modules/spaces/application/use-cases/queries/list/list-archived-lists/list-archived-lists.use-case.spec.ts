import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
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
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { ListArchivedListsInput } from './list-archived-lists.input.js';
import { ListArchivedLists } from './list-archived-lists.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** A list of "Marketing". */
const CAMPAGNES = '019a7100-0000-7000-8000-000000000004';

/** A list of "Produit" archived the same instant as Sprint 14, with a lower id. */
const SPRINT_13 = '019a7100-0000-7000-8000-000000000000';

/** Camille Martin, who archived the lists. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/** When Campagnes was archived, after Sprint 14. */
const LATER: Date = new Date('2026-11-05T09:00:00Z');

/**
 * Builds the first page of the archives of Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function archives(overrides: Partial<ListArchivedListsInput> = {}): ListArchivedListsInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    after: null,
    limit: 50,
    ...overrides,
  };
}

/**
 * Atelier Nord: Backlog (live) and Sprint 14 (archived on 3 November) in "Produit", Campagnes
 * (archived on 5 November) in "Marketing", Maquettes (archived) in the private "Design".
 */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState(), marketingState()],
    lists: [
      backlogState(),
      sprintState({ archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE, version: 2 }),
      backlogState({
        id: CAMPAGNES,
        spaceId: MARKETING,
        name: 'Campagnes',
        archivedAt: LATER,
        archivedBy: BY_CAMILLE,
      }),
      backlogState({
        id: MAQUETTES,
        spaceId: DESIGN,
        name: 'Maquettes',
        archivedAt: LATER,
        archivedBy: { type: 'user', id: HUGO },
      }),
    ],
  });
}

describe('ListArchivedLists: the archived lists a member has a role on, the latest first', () => {
  it('lists the archived lists by archive descending, with their archive and the role', async () => {
    const output = await new ListArchivedLists(atelierNord()).execute(archives());

    expect(output.total).toBe(2);
    expect(output.lists.map((list) => list.id)).toEqual([CAMPAGNES, SPRINT_14]);
    expect(output.lists[1]).toMatchObject({
      id: SPRINT_14,
      spaceId: PRODUIT,
      archivedAt: ARCHIVED_AT,
      archivedBy: BY_CAMILLE,
      version: 2,
      organizationAccess: true,
      callerRole: 'edit',
    });
  });

  it('leaves out the live lists and the archived lists the member has no role on', async () => {
    const output = await new ListArchivedLists(atelierNord()).execute(archives());

    expect(output.lists.map((list) => list.id)).not.toContain(BACKLOG);
    expect(output.lists.map((list) => list.id)).not.toContain(MAQUETTES);
  });

  it('gives the owner of a private space its archived lists', async () => {
    const output = await new ListArchivedLists(atelierNord()).execute(
      archives({ viewerUserId: HUGO }),
    );

    expect(output.lists.map((list) => list.id)).toEqual([CAMPAGNES, MAQUETTES, SPRINT_14]);
    expect(output.total).toBe(3);
  });

  it('gives a guest the archived lists shared with them only', async () => {
    const spaces = atelierNord();
    spaces.grants = [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'view')];

    const output = await new ListArchivedLists(spaces).execute(
      archives({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(output.lists.map((list) => [list.id, list.callerRole])).toEqual([[SPRINT_14, 'view']]);
    expect(output.total).toBe(1);
  });

  it('answers an empty page and a total of 0 without an archived list', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [backlogState()] });

    const output = await new ListArchivedLists(spaces).execute(archives());

    expect(output).toEqual({ lists: [], total: 0 });
  });

  it('answers no list of another organization', async () => {
    const output = await new ListArchivedLists(atelierNord()).execute(
      archives({ organizationId: OTHER_ORGANIZATION }),
    );

    expect(output).toEqual({ lists: [], total: 0 });
  });
});

describe('ListArchivedLists: a page holds the limit and continues after a position', () => {
  it('cuts the page at the limit and counts every archived list in the total', async () => {
    const spaces = atelierNord();

    const output = await new ListArchivedLists(spaces).execute(archives({ limit: 1 }));

    expect(output.lists.map((list) => list.id)).toEqual([CAMPAGNES]);
    expect(output.total).toBe(2);
    expect(spaces.listArchivedCalls).toEqual([
      { organizationId: ATELIER_NORD, viewerUserId: LEA, after: null, limit: 1 },
    ]);
  });

  it('continues after the archive of the last list of the previous page', async () => {
    const output = await new ListArchivedLists(atelierNord()).execute(
      archives({ after: { archivedAt: LATER, id: CAMPAGNES }, limit: 1 }),
    );

    expect(output.lists.map((list) => list.id)).toEqual([SPRINT_14]);
    expect(output.total).toBe(2);
  });

  it('breaks a tie of the archive instant by id, descending', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState({ archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE }),
        backlogState({ id: SPRINT_13, archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE }),
      ],
    });

    const first = await new ListArchivedLists(spaces).execute(archives());
    const after = await new ListArchivedLists(spaces).execute(
      archives({ after: { archivedAt: ARCHIVED_AT, id: SPRINT_14 } }),
    );

    expect(first.lists.map((list) => list.id)).toEqual([SPRINT_14, SPRINT_13]);
    expect(after.lists.map((list) => list.id)).toEqual([SPRINT_13]);
  });
});

describe('ListArchivedLists: a reading changes nothing', () => {
  it('takes no lock and appends no event', async () => {
    const spaces = atelierNord();

    await new ListArchivedLists(spaces).execute(archives());

    expect(spaces.journal).toEqual([]);
    expect(spaces.events).toEqual([]);
  });
});
