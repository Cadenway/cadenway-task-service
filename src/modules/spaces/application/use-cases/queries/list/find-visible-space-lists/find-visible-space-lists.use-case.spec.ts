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
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  SPRINT_14_GOAL,
  UNKNOWN_SPACE,
  backlogState,
  designState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { FindVisibleSpaceListsInput } from './find-visible-space-lists.input.js';
import type { FindVisibleSpaceListsOutput } from './find-visible-space-lists.output.js';
import { FindVisibleSpaceLists } from './find-visible-space-lists.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** A list created before Backlog, in the order of the creation and not of the ids. */
const ARCHIVE = '019a7100-0000-7000-8000-000000000009';

/**
 * Builds the lookup of the lists of "Produit" by Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function find(overrides: Partial<FindVisibleSpaceListsInput> = {}): FindVisibleSpaceListsInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    spaceId: PRODUIT,
    ...overrides,
  };
}

/** Atelier Nord: three lists in "Produit", "Maquettes" in the private "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      sprintState({ createdAt: new Date('2026-10-22T09:00:00Z') }),
      backlogState({ createdAt: new Date('2026-10-21T09:00:00Z') }),
      backlogState({
        id: ARCHIVE,
        name: 'Archive',
        createdAt: new Date('2026-10-20T09:00:00Z'),
      }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
  });
}

describe('FindVisibleSpaceLists: a member finds the lists of a space it sees', () => {
  it('returns the lists of the space in the order of their creation, with the dates of a sprint', async () => {
    const found = await new FindVisibleSpaceLists(atelierNord()).execute(find());

    expect(found?.lists.map((list) => list.id)).toEqual([ARCHIVE, BACKLOG, SPRINT_14]);
    expect(found?.lists[0]?.sprint).toBeNull();
    expect(found?.lists[2]).toEqual({
      id: SPRINT_14,
      spaceId: PRODUIT,
      name: 'Sprint 14',
      icon: null,
      color: 'indigo',
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: SPRINT_14_GOAL },
      createdAt: new Date('2026-10-22T09:00:00Z'),
      version: 1,
      organizationAccess: true,
      callerRole: 'edit',
    } satisfies FindVisibleSpaceListsOutput['lists'][number]);
  });

  it('breaks a tie of the creation instant by id', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState(), backlogState()],
    });

    const found = await new FindVisibleSpaceLists(spaces).execute(find());

    expect(found?.lists.map((list) => list.id)).toEqual([BACKLOG, SPRINT_14]);
  });

  it('answers an empty list for a visible space without a list', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });

    const found = await new FindVisibleSpaceLists(spaces).execute(find());

    expect(found).toEqual({ lists: [] });
  });

  it.each([
    ['the owner of the organization', CAMILLE, 'owner'],
    ['an admin', INES, 'admin'],
    ['a member', LEA, 'member'],
  ] as const)(
    'shows the lists of an organization space to %s',
    async (_who, viewerUserId, viewerRole) => {
      const found = await new FindVisibleSpaceLists(atelierNord()).execute(
        find({ viewerUserId, viewerRole }),
      );

      expect(found?.lists).toHaveLength(3);
    },
  );

  it('shows the lists of a private space to its owner only', async () => {
    const found = await new FindVisibleSpaceLists(atelierNord()).execute(
      find({ viewerUserId: HUGO, spaceId: DESIGN }),
    );

    expect(found?.lists.map((list) => list.id)).toEqual([MAQUETTES]);
  });
});

describe('FindVisibleSpaceLists: a space the viewer does not see answers null', () => {
  it.each([
    ['the owner of the organization', CAMILLE, 'owner'],
    ['an admin', INES, 'admin'],
    ['another member', LEA, 'member'],
  ] as const)('hides the private Design from %s', async (_who, viewerUserId, viewerRole) => {
    const found = await new FindVisibleSpaceLists(atelierNord()).execute(
      find({ viewerUserId, viewerRole, spaceId: DESIGN }),
    );

    expect(found).toBeNull();
  });

  it('hides an organization space from a guest, and reads no list for it', async () => {
    const spaces = atelierNord();

    const found = await new FindVisibleSpaceLists(spaces).execute(
      find({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(found).toBeNull();
    expect(spaces.listAllOfSpaceCalls).toEqual([]);
  });

  it('hides the private space of a guest account that is still named its owner', async () => {
    const found = await new FindVisibleSpaceLists(atelierNord()).execute(
      find({ viewerUserId: HUGO, viewerRole: 'guest', spaceId: DESIGN }),
    );

    expect(found).toBeNull();
  });

  it.each([
    ['its former owner', HUGO, 'member'],
    ['the owner of the organization', CAMILLE, 'owner'],
  ] as const)(
    'hides a space that awaits an owner from %s',
    async (_who, viewerUserId, viewerRole) => {
      const spaces = new InMemorySpaces({
        spaces: [designState({ awaitingOwner: true })],
        lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN })],
      });

      const found = await new FindVisibleSpaceLists(spaces).execute(
        find({ viewerUserId, viewerRole, spaceId: DESIGN }),
      );

      expect(found).toBeNull();
      expect(spaces.listAllOfSpaceCalls).toEqual([]);
    },
  );

  it('answers null for a space that does not exist', async () => {
    const found = await new FindVisibleSpaceLists(atelierNord()).execute(
      find({ spaceId: UNKNOWN_SPACE }),
    );

    expect(found).toBeNull();
  });

  it('answers null for a space of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [sprintState({ organizationId: OTHER_ORGANIZATION })],
    });

    const found = await new FindVisibleSpaceLists(spaces).execute(find());

    expect(found).toBeNull();
  });

  it('asks for the organization of the input only', async () => {
    const found = await new FindVisibleSpaceLists(atelierNord()).execute(
      find({ organizationId: OTHER_ORGANIZATION }),
    );

    expect(found).toBeNull();
  });

  it('leaves out the lists of another organization that share the space id', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), sprintState({ organizationId: OTHER_ORGANIZATION })],
    });

    const found = await new FindVisibleSpaceLists(spaces).execute(find());

    expect(found?.lists.map((list) => list.id)).toEqual([BACKLOG]);
  });
});

describe('FindVisibleSpaceLists: a lookup changes nothing', () => {
  it('runs once in the unit of work, appends no event and leaves the rows as they were', async () => {
    const spaces = atelierNord();
    const before = { spaces: new Map(spaces.spaces), lists: new Map(spaces.lists) };

    await new FindVisibleSpaceLists(spaces).execute(find());

    expect(spaces.runs).toBe(1);
    expect(spaces.listAllOfSpaceCalls).toEqual([PRODUIT]);
    expect(spaces.events).toEqual([]);
    expect(spaces.spaces).toEqual(before.spaces);
    expect(spaces.lists).toEqual(before.lists);
    expect(spaces.allocateCalls).toEqual([]);
  });
});

describe('FindVisibleSpaceLists: only the lists the viewer has a role on, each with that role', () => {
  it('finds for a guest the space of a list shared with them, and that list only', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), sprintState()],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'comment')],
    });

    const found = await new FindVisibleSpaceLists(spaces).execute(
      find({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(found?.lists.map((list) => [list.id, list.callerRole])).toEqual([
      [SPRINT_14, 'comment'],
    ]);
  });

  it('leaves out a list whose switch is off for a member it is not shared with', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), sprintState({ organizationAccess: false })],
    });

    const found = await new FindVisibleSpaceLists(spaces).execute(find());

    expect(found?.lists.map((list) => [list.id, list.organizationAccess])).toEqual([
      [BACKLOG, true],
    ]);
  });

  it('gives each list of a private space shared with the viewer the role of the grant of the space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' })],
      grants: [spaceGrantOf(DESIGN, LEA, 'view')],
    });

    const found = await new FindVisibleSpaceLists(spaces).execute(find({ spaceId: DESIGN }));

    expect(found?.lists.map((list) => [list.id, list.callerRole])).toEqual([[MAQUETTES, 'view']]);
  });
});
