import { describe, expect, it } from 'vitest';

import {
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
  designState,
  marketingState,
  spaceState,
} from '../../../spaces.fixture.js';
import type { ListVisibleSpaceIdsInput } from './list-visible-space-ids.input.js';
import { ListVisibleSpaceIds } from './list-visible-space-ids.use-case.js';

/** The space "Support" (SUP) of another organization. */
const ELSEWHERE = '019a7000-0000-7000-8000-000000000009';

/**
 * Builds the listing for Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function visibleTo(overrides: Partial<ListVisibleSpaceIdsInput> = {}): ListVisibleSpaceIdsInput {
  return { organizationId: ATELIER_NORD, viewerUserId: LEA, viewerRole: 'member', ...overrides };
}

/** Atelier Nord: Produit and the private Design on 20 October, Marketing on the 21st; one space elsewhere. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [
      spaceState(),
      designState(),
      marketingState(),
      spaceState({
        id: ELSEWHERE,
        organizationId: OTHER_ORGANIZATION,
        name: 'Support',
        prefix: 'SUP',
      }),
    ],
  });
}

describe('ListVisibleSpaceIds: a member sees the spaces of the organization and its private ones', () => {
  it('lists the organization spaces and no private space of another member, in creation order', async () => {
    const output = await new ListVisibleSpaceIds(atelierNord()).execute(visibleTo());

    expect(output).toEqual({ spaceIds: [PRODUIT, MARKETING] });
  });

  it('adds the private space its owner owns', async () => {
    const output = await new ListVisibleSpaceIds(atelierNord()).execute(
      visibleTo({ viewerUserId: HUGO }),
    );

    expect(output).toEqual({ spaceIds: [PRODUIT, DESIGN, MARKETING] });
  });

  it.each([
    ['the owner of the organization', CAMILLE, 'owner'],
    ['an admin', INES, 'admin'],
  ] as const)(
    'does not add the private space of another member for %s',
    async (_who, viewerUserId, viewerRole) => {
      const output = await new ListVisibleSpaceIds(atelierNord()).execute(
        visibleTo({ viewerUserId, viewerRole }),
      );

      expect(output.spaceIds).toEqual([PRODUIT, MARKETING]);
    },
  );

  it.each([
    ['its former owner', HUGO, 'member'],
    ['the owner of the organization', CAMILLE, 'owner'],
  ] as const)(
    'leaves out a space awaiting an owner for %s',
    async (_who, viewerUserId, viewerRole) => {
      const spaces = new InMemorySpaces({
        spaces: [spaceState(), designState({ awaitingOwner: true })],
      });

      const output = await new ListVisibleSpaceIds(spaces).execute(
        visibleTo({ viewerUserId, viewerRole }),
      );

      expect(output.spaceIds).toEqual([PRODUIT]);
    },
  );

  it('lists nothing for an organization without a space', async () => {
    const output = await new ListVisibleSpaceIds(atelierNord()).execute(
      visibleTo({ organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b77' }),
    );

    expect(output).toEqual({ spaceIds: [] });
  });

  it('lists the spaces of the organization of the input only', async () => {
    const output = await new ListVisibleSpaceIds(atelierNord()).execute(
      visibleTo({ organizationId: OTHER_ORGANIZATION }),
    );

    expect(output).toEqual({ spaceIds: [ELSEWHERE] });
  });
});

describe('ListVisibleSpaceIds: a guest sees no space', () => {
  it('answers an empty list without reading the spaces, even for a guest named owner of one', async () => {
    const spaces = atelierNord();

    const output = await new ListVisibleSpaceIds(spaces).execute(
      visibleTo({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );
    const hugoAsGuest = await new ListVisibleSpaceIds(spaces).execute(
      visibleTo({ viewerUserId: HUGO, viewerRole: 'guest' }),
    );

    expect(output).toEqual({ spaceIds: [] });
    expect(hugoAsGuest).toEqual({ spaceIds: [] });
    expect(spaces.listVisibleIdsCalls).toEqual([]);
  });
});

describe('ListVisibleSpaceIds: a listing changes nothing', () => {
  it('runs once in the unit of work, reads for the viewer and appends no event', async () => {
    const spaces = atelierNord();

    await new ListVisibleSpaceIds(spaces).execute(visibleTo());

    expect(spaces.runs).toBe(1);
    expect(spaces.listVisibleIdsCalls).toEqual([
      { organizationId: ATELIER_NORD, viewerUserId: LEA },
    ]);
    expect(spaces.events).toEqual([]);
  });
});
