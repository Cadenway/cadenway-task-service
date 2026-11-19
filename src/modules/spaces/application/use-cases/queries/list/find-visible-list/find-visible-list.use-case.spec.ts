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
  UNKNOWN_LIST,
  UNKNOWN_SPACE,
  backlogState,
  designState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { FindVisibleListInput } from './find-visible-list.input.js';
import type { FindVisibleListOutput } from './find-visible-list.output.js';
import { FindVisibleList } from './find-visible-list.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Builds the lookup of Sprint 14 by Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function find(overrides: Partial<FindVisibleListInput> = {}): FindVisibleListInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    listId: SPRINT_14,
    ...overrides,
  };
}

/** Atelier Nord: Backlog and Sprint 14 in "Produit" (CAD-481 given), "Maquettes" in the private "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      backlogState(),
      sprintState(),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
    lastNumbers: { CAD: 481 },
  });
}

describe('FindVisibleList: a member finds the list and its space', () => {
  it('returns Sprint 14 with its dates and goal, and the space with the next key', async () => {
    const found = await new FindVisibleList(atelierNord()).execute(find());

    expect(found).toEqual({
      list: {
        id: SPRINT_14,
        spaceId: PRODUIT,
        name: 'Sprint 14',
        icon: null,
        color: 'indigo',
        sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: SPRINT_14_GOAL },
        createdAt: sprintState().createdAt,
        version: 1,
        organizationAccess: true,
        callerRole: 'edit',
      },
      space: {
        id: PRODUIT,
        name: 'Produit',
        prefix: 'CAD',
        description: null,
        icon: 'rocket',
        color: 'violet',
        visibility: 'organization',
        ownerUserId: CAMILLE,
        statuses: spaceState().statuses,
        nextKey: 'CAD-482',
        createdAt: spaceState().createdAt,
        version: 1,
        callerRole: 'edit',
        callerCanManage: false,
      },
    } satisfies FindVisibleListOutput);
  });

  it('returns the list Backlog, which is no sprint', async () => {
    const found = await new FindVisibleList(atelierNord()).execute(find({ listId: BACKLOG }));

    expect(found?.list.sprint).toBeNull();
    expect(found?.list.name).toBe('Backlog');
  });

  it('previews the key 1 for a space that has given no number yet', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    const found = await new FindVisibleList(spaces).execute(find());

    expect(found?.space.nextKey).toBe('CAD-1');
  });

  it.each([
    ['the owner of the organization', CAMILLE, 'owner'],
    ['an admin', INES, 'admin'],
    ['a member', LEA, 'member'],
  ] as const)(
    'shows a list of an organization space to %s',
    async (_who, viewerUserId, viewerRole) => {
      const found = await new FindVisibleList(atelierNord()).execute(
        find({ viewerUserId, viewerRole }),
      );

      expect(found?.list.id).toBe(SPRINT_14);
    },
  );

  it('shows a list of a private space to the owner of that space, with the hidden statuses', async () => {
    const spaces = new InMemorySpaces({
      spaces: [
        designState({
          statuses: { ...designState().statuses, review: { name: null, hidden: true } },
        }),
      ],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' })],
    });

    const found = await new FindVisibleList(spaces).execute(
      find({ viewerUserId: HUGO, listId: MAQUETTES }),
    );

    expect(found?.space.id).toBe(DESIGN);
    expect(found?.space.visibility).toBe('private');
    expect(found?.space.statuses.review.hidden).toBe(true);
  });
});

describe('FindVisibleList: a list the viewer does not see answers null', () => {
  it.each([
    ['the owner of the organization', CAMILLE, 'owner'],
    ['an admin', INES, 'admin'],
    ['another member', LEA, 'member'],
  ] as const)(
    'hides a list of the private Design from %s',
    async (_who, viewerUserId, viewerRole) => {
      const found = await new FindVisibleList(atelierNord()).execute(
        find({ viewerUserId, viewerRole, listId: MAQUETTES }),
      );

      expect(found).toBeNull();
    },
  );

  it('hides a list of an organization space from a guest', async () => {
    const found = await new FindVisibleList(atelierNord()).execute(
      find({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(found).toBeNull();
  });

  it('hides a list of the private space of a guest account that is still named its owner', async () => {
    const found = await new FindVisibleList(atelierNord()).execute(
      find({ viewerUserId: HUGO, viewerRole: 'guest', listId: MAQUETTES }),
    );

    expect(found).toBeNull();
  });

  it.each([
    ['its former owner', HUGO, 'member'],
    ['the owner of the organization', CAMILLE, 'owner'],
  ] as const)(
    'hides the lists of a space that awaits an owner from %s',
    async (_who, viewerUserId, viewerRole) => {
      const spaces = new InMemorySpaces({
        spaces: [designState({ awaitingOwner: true })],
        lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN })],
      });

      const found = await new FindVisibleList(spaces).execute(
        find({ viewerUserId, viewerRole, listId: MAQUETTES }),
      );

      expect(found).toBeNull();
    },
  );

  it('answers null for a list that does not exist', async () => {
    const found = await new FindVisibleList(atelierNord()).execute(find({ listId: UNKNOWN_LIST }));

    expect(found).toBeNull();
  });

  it('answers null for a list of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [sprintState({ organizationId: OTHER_ORGANIZATION })],
    });

    const found = await new FindVisibleList(spaces).execute(find());

    expect(found).toBeNull();
  });

  it('answers null for a list whose space is not in the organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ id: UNKNOWN_SPACE })],
      lists: [sprintState({ spaceId: PRODUIT })],
    });

    const found = await new FindVisibleList(spaces).execute(find());

    expect(found).toBeNull();
  });

  it('asks for the organization of the input only', async () => {
    const found = await new FindVisibleList(atelierNord()).execute(
      find({ organizationId: OTHER_ORGANIZATION }),
    );

    expect(found).toBeNull();
  });
});

describe('FindVisibleList: a lookup changes nothing', () => {
  it('runs once in the unit of work, appends no event and leaves the rows and the counter as they were', async () => {
    const spaces = atelierNord();
    const before = { spaces: new Map(spaces.spaces), lists: new Map(spaces.lists) };

    await new FindVisibleList(spaces).execute(find());

    expect(spaces.runs).toBe(1);
    expect(spaces.events).toEqual([]);
    expect(spaces.spaces).toEqual(before.spaces);
    expect(spaces.lists).toEqual(before.lists);
    expect(spaces.lastNumberOf(ATELIER_NORD, 'CAD')).toBe(481);
    expect(spaces.allocateCalls).toEqual([]);
  });
});

describe('FindVisibleList: the role of the viewer on the list and its access to the space', () => {
  it('finds for a guest a list shared with them, with its role and no role on the space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState()],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'view')],
    });

    const found = await new FindVisibleList(spaces).execute(
      find({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(found?.list.callerRole).toBe('view');
    expect(found?.space).toMatchObject({ callerRole: null, callerCanManage: false });
  });

  it('answers null for a list whose switch is off to a member it is not shared with', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ organizationAccess: false })],
    });

    expect(await new FindVisibleList(spaces).execute(find())).toBeNull();
  });

  it('finds a list of a private space shared with the viewer through the space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' })],
      grants: [spaceGrantOf(DESIGN, LEA, 'comment')],
    });

    const found = await new FindVisibleList(spaces).execute(find({ listId: MAQUETTES }));

    expect(found?.list).toMatchObject({ callerRole: 'comment', organizationAccess: true });
    expect(found?.space).toMatchObject({ callerRole: 'comment', callerCanManage: false });
  });

  it('answers the owner of the space that they manage it and have edit on the list', async () => {
    const found = await new FindVisibleList(atelierNord()).execute(
      find({ viewerUserId: CAMILLE, viewerRole: 'owner' }),
    );

    expect(found?.list.callerRole).toBe('edit');
    expect(found?.space).toMatchObject({ callerRole: 'edit', callerCanManage: true });
  });
});
