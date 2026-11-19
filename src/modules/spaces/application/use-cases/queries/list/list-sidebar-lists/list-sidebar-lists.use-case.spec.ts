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
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  backlogState,
  designState,
  listGrantOf,
  marketingState,
  spaceState,
} from '../../../spaces.fixture.js';
import type { ListSidebarListsInput } from './list-sidebar-lists.input.js';
import { ListSidebarLists } from './list-sidebar-lists.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000021';

/** A list of "Marketing". */
const CAMPAGNES = '019a7100-0000-7000-8000-000000000022';

/** A list of "Produit" created after Sprint 14, with a lower id than Backlog. */
const ROADMAP = '019a7100-0000-7000-8000-000000000000';

/**
 * Builds the listing for Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function sidebar(overrides: Partial<ListSidebarListsInput> = {}): ListSidebarListsInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    limit: 6,
    ...overrides,
  };
}

/**
 * Atelier Nord: Produit (20 October) with Backlog, Sprint 14 and Roadmap, the private Design (20
 * October, after Produit by id) with Maquettes, Marketing (21 October) with Campagnes. The lists
 * are stored out of order.
 */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [marketingState(), designState(), spaceState()],
    lists: [
      backlogState({ id: CAMPAGNES, spaceId: MARKETING, name: 'Campagnes' }),
      backlogState({ id: ROADMAP, name: 'Roadmap', createdAt: new Date('2026-10-23T09:00:00Z') }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
      backlogState({
        id: SPRINT_14,
        name: 'Sprint 14',
        createdAt: new Date('2026-10-22T09:00:00Z'),
      }),
      backlogState({ createdAt: new Date('2026-10-21T09:00:00Z') }),
    ],
  });
}

describe('ListSidebarLists: the first lists of the sidebar of a member', () => {
  it('orders the spaces by creation, then the lists of each space by creation, sprints included', async () => {
    const output = await new ListSidebarLists(atelierNord()).execute(sidebar());

    expect(output.lists.map((list) => list.id)).toEqual([BACKLOG, SPRINT_14, ROADMAP, CAMPAGNES]);
  });

  it('leaves an archived list out of the sidebar', async () => {
    const spaces = atelierNord();
    const sprint = spaces.lists.get(SPRINT_14);
    if (sprint === undefined) {
      throw new Error('Sprint 14 is seeded.');
    }
    spaces.lists.set(SPRINT_14, {
      ...sprint,
      archivedAt: ARCHIVED_AT,
      archivedBy: { type: 'user', id: CAMILLE },
    });

    const output = await new ListSidebarLists(spaces).execute(sidebar());

    expect(output.lists.map((list) => list.id)).toEqual([BACKLOG, ROADMAP, CAMPAGNES]);
  });

  it('puts a restored list at the end of its space, before the lists of the next space', async () => {
    const spaces = atelierNord();
    const backlog = spaces.lists.get(BACKLOG);
    if (backlog === undefined) {
      throw new Error('Backlog is seeded.');
    }
    spaces.lists.set(BACKLOG, { ...backlog, restoredAt: new Date('2026-11-08T17:00:00Z') });

    const output = await new ListSidebarLists(spaces).execute(sidebar());

    expect(output.lists.map((list) => list.id)).toEqual([SPRINT_14, ROADMAP, BACKLOG, CAMPAGNES]);
  });

  it('maps a list to its public projection', async () => {
    const output = await new ListSidebarLists(atelierNord()).execute(sidebar({ limit: 1 }));

    expect(output.lists).toEqual([
      {
        id: BACKLOG,
        spaceId: PRODUIT,
        name: 'Backlog',
        icon: null,
        color: 'gris',
        sprint: null,
        createdAt: new Date('2026-10-21T09:00:00Z'),
        version: 1,
        organizationAccess: true,
        archivedAt: null,
        archivedBy: null,
        callerRole: 'edit',
      },
    ]);
  });

  it('breaks a tie of the creation instant of two lists by id', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), backlogState({ id: ROADMAP, name: 'Roadmap' })],
    });

    const output = await new ListSidebarLists(spaces).execute(sidebar());

    expect(output.lists.map((list) => list.id)).toEqual([ROADMAP, BACKLOG]);
  });

  it('keeps the first lists of the order at most limit, across spaces', async () => {
    const spaces = atelierNord();

    const output = await new ListSidebarLists(spaces).execute(sidebar({ limit: 3 }));

    expect(output.lists.map((list) => list.id)).toEqual([BACKLOG, SPRINT_14, ROADMAP]);
    expect(spaces.listFirstVisibleCalls).toEqual([
      { organizationId: ATELIER_NORD, viewerUserId: LEA, limit: 3 },
    ]);
  });

  it('answers an empty list when no visible space holds a list', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });

    const output = await new ListSidebarLists(spaces).execute(sidebar());

    expect(output).toEqual({ lists: [] });
  });
});

describe('ListSidebarLists: only the spaces the viewer sees', () => {
  it('puts the lists of the private space of its owner between those of the spaces by creation', async () => {
    const output = await new ListSidebarLists(atelierNord()).execute(
      sidebar({ viewerUserId: HUGO }),
    );

    expect(output.lists.map((list) => list.id)).toEqual([
      BACKLOG,
      SPRINT_14,
      ROADMAP,
      MAQUETTES,
      CAMPAGNES,
    ]);
  });

  it.each([
    ['the owner of the organization', CAMILLE, 'owner'],
    ['an admin', INES, 'admin'],
  ] as const)(
    'leaves out the lists of the private space of another member for %s',
    async (_who, viewerUserId, viewerRole) => {
      const output = await new ListSidebarLists(atelierNord()).execute(
        sidebar({ viewerUserId, viewerRole }),
      );

      expect(output.lists.map((list) => list.id)).not.toContain(MAQUETTES);
      expect(output.lists).toHaveLength(4);
    },
  );

  it.each([
    ['its former owner', HUGO, 'member'],
    ['the owner of the organization', CAMILLE, 'owner'],
  ] as const)(
    'leaves out the lists of a space that awaits an owner for %s',
    async (_who, viewerUserId, viewerRole) => {
      const spaces = new InMemorySpaces({
        spaces: [designState({ awaitingOwner: true })],
        lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN })],
      });

      const output = await new ListSidebarLists(spaces).execute(
        sidebar({ viewerUserId, viewerRole }),
      );

      expect(output.lists).toEqual([]);
    },
  );

  it('leaves out the lists of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [backlogState({ organizationId: OTHER_ORGANIZATION })],
    });

    const output = await new ListSidebarLists(spaces).execute(sidebar());

    expect(output.lists).toEqual([]);
  });

  it('answers an empty list for a guest no list is shared with', async () => {
    const spaces = atelierNord();

    const output = await new ListSidebarLists(spaces).execute(
      sidebar({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(output).toEqual({ lists: [] });
  });

  it('answers an empty list for the former owner of a private space who is now a guest, without a grant', async () => {
    const spaces = atelierNord();

    const output = await new ListSidebarLists(spaces).execute(
      sidebar({ viewerUserId: HUGO, viewerRole: 'guest' }),
    );

    expect(output).toEqual({ lists: [] });
  });
});

describe('ListSidebarLists: a listing changes nothing', () => {
  it('runs once in the unit of work, appends no event and leaves the rows as they were', async () => {
    const spaces = atelierNord();
    const before = { spaces: new Map(spaces.spaces), lists: new Map(spaces.lists) };

    await new ListSidebarLists(spaces).execute(sidebar());

    expect(spaces.runs).toBe(1);
    expect(spaces.events).toEqual([]);
    expect(spaces.spaces).toEqual(before.spaces);
    expect(spaces.lists).toEqual(before.lists);
    expect(spaces.allocateCalls).toEqual([]);
  });
});

describe('ListSidebarLists: the lists the viewer has a role on, each with that role', () => {
  it('lists to a guest the lists shared with them, in sidebar order', async () => {
    const spaces = atelierNord();
    spaces.grants = [
      listGrantOf(MARKETING, CAMPAGNES, NADIA, 'edit'),
      listGrantOf(DESIGN, MAQUETTES, NADIA, 'view'),
    ];

    const output = await new ListSidebarLists(spaces).execute(
      sidebar({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(output.lists.map((list) => [list.id, list.callerRole])).toEqual([
      [MAQUETTES, 'view'],
      [CAMPAGNES, 'edit'],
    ]);
  });

  it('leaves out a list whose switch is off for a member it is not shared with, not for the owner of the space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState({ organizationAccess: false })],
    });
    const listing = new ListSidebarLists(spaces);

    expect((await listing.execute(sidebar())).lists).toEqual([]);
    expect(
      (await listing.execute(sidebar({ viewerUserId: CAMILLE, viewerRole: 'owner' }))).lists,
    ).toHaveLength(1);
  });
});
