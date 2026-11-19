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
  PRODUIT,
  atelierNordMembers,
  backlogState,
  designState,
  listGrantOf,
  refusalOf,
  spaceGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import type { ListSpaceGrantsInput } from './list-space-grants.input.js';
import { ListSpaceGrants } from './list-space-grants.use-case.js';

/**
 * Builds the first page of the grants of Produit read by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function grantsOfProduit(overrides: Partial<ListSpaceGrantsInput> = {}): ListSpaceGrantsInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    spaceId: PRODUIT,
    after: null,
    limit: 50,
    ...overrides,
  };
}

/** Produit shared with Hugo Dubois (4 March), Inès Robert and Camille's guest list Backlog (5 March). */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [backlogState()],
    grants: [
      spaceGrantOf(PRODUIT, INES, 'view', { createdAt: new Date('2026-03-05T09:00:00Z') }),
      spaceGrantOf(PRODUIT, HUGO, 'edit'),
      listGrantOf(PRODUIT, BACKLOG, NADIA, 'view'),
    ],
  });
}

describe('ListSpaceGrants: whoever sees the space reads its grants, in the order they were first given', () => {
  it('lists the grants of the space, with their total', async () => {
    const page = await new ListSpaceGrants(atelierNord(), atelierNordMembers()).execute(
      grantsOfProduit(),
    );

    expect(page.items.map((grant) => [grant.userId, grant.role])).toEqual([
      [HUGO, 'edit'],
      [INES, 'view'],
    ]);
    expect(page.total).toBe(2);
    expect(page.next).toBeNull();
  });

  it('cuts pages of the limit, with the total on each and the position of the last person', async () => {
    const listing = new ListSpaceGrants(atelierNord(), atelierNordMembers());

    const first = await listing.execute(grantsOfProduit({ limit: 1 }));
    const second = await listing.execute(grantsOfProduit({ limit: 1, after: first.next }));

    expect(first.items.map((grant) => grant.userId)).toEqual([HUGO]);
    expect(first.next).toEqual({ createdAt: first.items[0]?.createdAt, id: HUGO });
    expect(first.total).toBe(2);
    expect(second.items.map((grant) => grant.userId)).toEqual([INES]);
    expect(second.next).toBeNull();
    expect(second.total).toBe(2);
  });

  it('lets a guest who sees the space through one of its lists read them', async () => {
    const page = await new ListSpaceGrants(atelierNord(), atelierNordMembers()).execute(
      grantsOfProduit({ actorUserId: NADIA }),
    );

    expect(page.total).toBe(2);
  });

  it('answers space-not-found for a space the actor does not see', async () => {
    const refusal = await refusalOf(
      new ListSpaceGrants(atelierNord(), atelierNordMembers()).execute(
        grantsOfProduit({ actorUserId: CAMILLE, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });
});
