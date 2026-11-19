import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
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
  SPRINT_14_GOAL,
  backlogState,
  designState,
  listGrantOf,
  marketingState,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { ListCurrentSprintsInput } from './list-current-sprints.input.js';
import { ListCurrentSprints } from './list-current-sprints.use-case.js';

/** A sprint of the private space "Design". */
const DESIGN_SPRINT = '019a7100-0000-7000-8000-000000000011';

/** A sprint of "Marketing" that ends before Sprint 14. */
const MARKETING_SPRINT = '019a7100-0000-7000-8000-000000000012';

/** A sprint that ends the same day as Sprint 14, created after it. */
const LATE_SPRINT = '019a7100-0000-7000-8000-000000000013';

/** A sprint that ends the same day and was created the same instant as Sprint 14, with a lower id. */
const TWIN_SPRINT = '019a7100-0000-7000-8000-000000000000';

/**
 * Builds the listing for Léa Petit, a member, on the last day of Sprint 14.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function current(overrides: Partial<ListCurrentSprintsInput> = {}): ListCurrentSprintsInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    today: '2026-11-08',
    limit: 10,
    ...overrides,
  };
}

/**
 * Builds a sprint of a space.
 *
 * @param id - The id of the sprint.
 * @param spaceId - Its space.
 * @param startDate - First day.
 * @param endDate - Last day.
 * @param createdAt - When it was created.
 * @returns The stored sprint.
 */
function sprint(
  id: string,
  spaceId: string,
  startDate: string,
  endDate: string,
  createdAt: string = '2026-10-20T09:00:00Z',
): ReturnType<typeof sprintState> {
  return sprintState({
    id,
    spaceId,
    name: `Sprint ${id.slice(-2)}`,
    sprint: { startDate, endDate, goal: null },
    createdAt: new Date(createdAt),
  });
}

/** Atelier Nord: Produit, the private Design and Marketing, each with sprints around 8 November. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState(), marketingState()],
    lists: [
      sprintState(),
      backlogState(),
      sprint(DESIGN_SPRINT, DESIGN, '2026-11-01', '2026-11-30'),
      sprint(MARKETING_SPRINT, MARKETING, '2026-11-02', '2026-11-10'),
    ],
  });
}

describe('ListCurrentSprints: the sprints under way in the spaces a member sees', () => {
  it('returns the sprints that hold the day, by end date, with their dates and goal', async () => {
    const output = await new ListCurrentSprints(atelierNord()).execute(current());

    expect(output.lists.map((list) => list.id)).toEqual([MARKETING_SPRINT, SPRINT_14]);
    expect(output.lists[1]).toEqual({
      id: SPRINT_14,
      spaceId: PRODUIT,
      name: 'Sprint 14',
      icon: null,
      color: 'indigo',
      sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: SPRINT_14_GOAL },
      createdAt: sprintState().createdAt,
      version: 1,
      organizationAccess: true,
      archivedAt: null,
      archivedBy: null,
      callerRole: 'edit',
    });
  });

  it('leaves an archived sprint out of Accueil', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), marketingState()],
      lists: [
        sprintState({ archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: CAMILLE } }),
        sprint(MARKETING_SPRINT, MARKETING, '2026-11-02', '2026-11-10'),
      ],
    });

    const output = await new ListCurrentSprints(spaces).execute(current());

    expect(output.lists.map((list) => list.id)).toEqual([MARKETING_SPRINT]);
  });

  it('keeps a restored sprint in the order of its last day then of its creation', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState({ restoredAt: new Date('2026-11-07T09:00:00Z') }),
        sprint(LATE_SPRINT, PRODUIT, '2026-11-03', '2026-11-17', '2026-10-25T09:00:00Z'),
      ],
    });

    const output = await new ListCurrentSprints(spaces).execute(current());

    expect(output.lists.map((list) => list.id)).toEqual([SPRINT_14, LATE_SPRINT]);
  });

  it.each([
    ['the first day', '2026-11-03', [SPRINT_14]],
    ['the last day', '2026-11-17', [SPRINT_14]],
    ['the day before the start', '2026-11-02', []],
    ['the day after the end', '2026-11-18', []],
  ] as const)('holds %s of the period, bounds included', async (_when, today, expected) => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState(), backlogState()],
    });

    const output = await new ListCurrentSprints(spaces).execute(current({ today }));

    expect(output.lists.map((list) => list.id)).toEqual(expected);
  });

  it('holds a one-day sprint on that day only', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprint(LATE_SPRINT, PRODUIT, '2026-11-08', '2026-11-08')],
    });

    const on = await new ListCurrentSprints(spaces).execute(current({ today: '2026-11-08' }));
    const before = await new ListCurrentSprints(spaces).execute(current({ today: '2026-11-07' }));
    const after = await new ListCurrentSprints(spaces).execute(current({ today: '2026-11-09' }));

    expect(on.lists.map((list) => list.id)).toEqual([LATE_SPRINT]);
    expect(before.lists).toEqual([]);
    expect(after.lists).toEqual([]);
  });

  it('leaves out a list that is no sprint', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [backlogState()] });

    const output = await new ListCurrentSprints(spaces).execute(current());

    expect(output).toEqual({ lists: [] });
  });

  it('orders by end date, then creation instant, then id', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprint(LATE_SPRINT, PRODUIT, '2026-11-01', '2026-11-17', '2026-10-25T09:00:00Z'),
        sprintState(),
        sprint(TWIN_SPRINT, PRODUIT, '2026-11-01', '2026-11-17'),
        sprint(MARKETING_SPRINT, PRODUIT, '2026-11-01', '2026-11-09'),
      ],
    });

    const output = await new ListCurrentSprints(spaces).execute(current());

    expect(output.lists.map((list) => list.id)).toEqual([
      MARKETING_SPRINT,
      TWIN_SPRINT,
      SPRINT_14,
      LATE_SPRINT,
    ]);
  });

  it('keeps the first sprints of the order at most limit', async () => {
    const spaces = atelierNord();

    const output = await new ListCurrentSprints(spaces).execute(current({ limit: 1 }));

    expect(output.lists.map((list) => list.id)).toEqual([MARKETING_SPRINT]);
    expect(spaces.listCurrentSprintsCalls).toEqual([
      { organizationId: ATELIER_NORD, viewerUserId: LEA, today: '2026-11-08', limit: 1 },
    ]);
  });
});

describe('ListCurrentSprints: only the spaces the viewer sees', () => {
  it('adds the sprints of the private space its owner owns', async () => {
    const output = await new ListCurrentSprints(atelierNord()).execute(
      current({ viewerUserId: HUGO }),
    );

    expect(output.lists.map((list) => list.id)).toEqual([
      MARKETING_SPRINT,
      SPRINT_14,
      DESIGN_SPRINT,
    ]);
  });

  it.each([
    ['the owner of the organization', CAMILLE, 'owner'],
    ['an admin', INES, 'admin'],
  ] as const)(
    'leaves out the sprints of the private space of another member for %s',
    async (_who, viewerUserId, viewerRole) => {
      const output = await new ListCurrentSprints(atelierNord()).execute(
        current({ viewerUserId, viewerRole }),
      );

      expect(output.lists.map((list) => list.id)).toEqual([MARKETING_SPRINT, SPRINT_14]);
    },
  );

  it.each([
    ['its former owner', HUGO, 'member'],
    ['the owner of the organization', CAMILLE, 'owner'],
  ] as const)(
    'leaves out the sprints of a space that awaits an owner for %s',
    async (_who, viewerUserId, viewerRole) => {
      const spaces = new InMemorySpaces({
        spaces: [designState({ awaitingOwner: true })],
        lists: [sprint(DESIGN_SPRINT, DESIGN, '2026-11-01', '2026-11-30')],
      });

      const output = await new ListCurrentSprints(spaces).execute(
        current({ viewerUserId, viewerRole }),
      );

      expect(output.lists).toEqual([]);
    },
  );

  it('leaves out the sprints of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [sprintState({ organizationId: OTHER_ORGANIZATION })],
    });

    const output = await new ListCurrentSprints(spaces).execute(current());

    expect(output.lists).toEqual([]);
  });

  it('answers an empty list for a guest no sprint is shared with', async () => {
    const spaces = atelierNord();

    const output = await new ListCurrentSprints(spaces).execute(
      current({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(output).toEqual({ lists: [] });
  });

  it('answers an empty list for the former owner of a private space who is now a guest, without a grant', async () => {
    const spaces = atelierNord();

    const output = await new ListCurrentSprints(spaces).execute(
      current({ viewerUserId: HUGO, viewerRole: 'guest' }),
    );

    expect(output).toEqual({ lists: [] });
  });
});

describe('ListCurrentSprints: a listing changes nothing', () => {
  it('runs once in the unit of work, appends no event and leaves the rows as they were', async () => {
    const spaces = atelierNord();
    const before = { spaces: new Map(spaces.spaces), lists: new Map(spaces.lists) };

    await new ListCurrentSprints(spaces).execute(current());

    expect(spaces.runs).toBe(1);
    expect(spaces.events).toEqual([]);
    expect(spaces.spaces).toEqual(before.spaces);
    expect(spaces.lists).toEqual(before.lists);
    expect(spaces.allocateCalls).toEqual([]);
  });
});

describe('ListCurrentSprints: the sprints the viewer has a role on, each with that role', () => {
  it('lists to a guest the sprints shared with them, with the role of the grant', async () => {
    const spaces = atelierNord();
    spaces.grants = [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'comment')];

    const output = await new ListCurrentSprints(spaces).execute(
      current({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(output.lists.map((list) => [list.id, list.callerRole])).toEqual([
      [SPRINT_14, 'comment'],
    ]);
  });

  it('leaves out a sprint whose switch is off for a member it is not shared with', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ organizationAccess: false })],
    });

    const output = await new ListCurrentSprints(spaces).execute(current());

    expect(output.lists).toEqual([]);
  });

  it('adds the sprint of a private space shared with the viewer through the space', async () => {
    const spaces = atelierNord();
    spaces.grants = [spaceGrantOf(DESIGN, LEA, 'view')];

    const output = await new ListCurrentSprints(spaces).execute(current());

    expect(output.lists.map((list) => [list.id, list.callerRole])).toEqual([
      [MARKETING_SPRINT, 'edit'],
      [SPRINT_14, 'edit'],
      [DESIGN_SPRINT, 'view'],
    ]);
  });
});
