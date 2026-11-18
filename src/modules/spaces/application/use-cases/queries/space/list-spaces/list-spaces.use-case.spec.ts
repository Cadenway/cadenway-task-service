import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  MARKETING,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  STRANGER,
  atelierNordMembers,
  designState,
  marketingState,
  refusalOf,
  spaceState,
} from '../../../spaces.fixture.js';
import type { ListSpacesInput } from './list-spaces.input.js';
import { ListSpaces } from './list-spaces.use-case.js';

/** The space "Support" (SUP), the last created. */
const SUPPORT = '019a7000-0000-7000-8000-000000000005';

/**
 * Builds the first page of the spaces Léa Petit sees.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function listSpaces(overrides: Partial<ListSpacesInput> = {}): ListSpacesInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    after: null,
    limit: 50,
    ...overrides,
  };
}

/** Atelier Nord: Produit and the private Design on 20 October, Marketing on the 21st and Support on the 22nd. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [
      spaceState(),
      designState(),
      marketingState(),
      spaceState({
        id: SUPPORT,
        name: 'Support',
        prefix: 'SUP',
        createdAt: new Date('2026-10-22T09:00:00Z'),
      }),
    ],
    lastNumbers: { CAD: 481, MKT: 9 },
  });
}

describe('ListSpaces: the spaces the caller sees, in the order they were created', () => {
  it('lists the spaces of the whole organization to a member, with their next key', async () => {
    const page = await new ListSpaces(atelierNord(), atelierNordMembers()).execute(listSpaces());

    expect(page.items.map((view) => [view.space.id, view.nextKey])).toEqual([
      [PRODUIT, 'CAD-482'],
      [MARKETING, 'MKT-10'],
      [SUPPORT, 'SUP-1'],
    ]);
    expect(page.next).toBeNull();
  });

  it('adds the private space to its owner', async () => {
    const page = await new ListSpaces(atelierNord(), atelierNordMembers()).execute(
      listSpaces({ actorUserId: HUGO }),
    );

    expect(page.items.map((view) => view.space.prefix)).toEqual(['CAD', 'DES', 'MKT', 'SUP']);
  });

  it.each([
    ['the owner of the organization', CAMILLE],
    ['an admin', INES],
    ['another member', LEA],
  ])('leaves a private space out of the page of %s', async (_who: string, actorUserId: string) => {
    const page = await new ListSpaces(atelierNord(), atelierNordMembers()).execute(
      listSpaces({ actorUserId }),
    );

    expect(page.items.map((view) => view.space.prefix)).not.toContain('DES');
  });

  it('leaves out the spaces of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), marketingState({ organizationId: OTHER_ORGANIZATION })],
    });

    const page = await new ListSpaces(spaces, atelierNordMembers()).execute(listSpaces());

    expect(page.items.map((view) => view.space.id)).toEqual([PRODUIT]);
    expect(spaces.listVisibleCalls[0]?.organizationId).toBe(ATELIER_NORD);
  });

  it('is an empty page for an organization with no space', async () => {
    const spaces = new InMemorySpaces();

    const page = await new ListSpaces(spaces, atelierNordMembers()).execute(listSpaces());

    expect(page).toEqual({ items: [], next: null });
    expect(spaces.nextNumbersCalls).toEqual([]);
  });
});

describe('ListSpaces: a page holds the limit, and limit + 1 rows are read to know there is a next', () => {
  it('reads limit + 1 spaces and answers the limit with the position of the last one', async () => {
    const spaces = atelierNord();

    const page = await new ListSpaces(spaces, atelierNordMembers()).execute(
      listSpaces({ limit: 2 }),
    );

    expect(spaces.listVisibleCalls).toEqual([
      { organizationId: ATELIER_NORD, viewerUserId: LEA, after: null, limit: 3 },
    ]);
    expect(page.items.map((view) => view.space.id)).toEqual([PRODUIT, MARKETING]);
    expect(page.next).toEqual({ createdAt: marketingState().createdAt, id: MARKETING });
  });

  it('answers no next position when exactly the limit of spaces remain', async () => {
    const page = await new ListSpaces(atelierNord(), atelierNordMembers()).execute(
      listSpaces({ limit: 3 }),
    );

    expect(page.items).toHaveLength(3);
    expect(page.next).toBeNull();
  });

  it('continues after the position of the previous page and ends on the last space', async () => {
    const spaces = atelierNord();
    const list = new ListSpaces(spaces, atelierNordMembers());
    const first = await list.execute(listSpaces({ limit: 2 }));

    const second = await list.execute(listSpaces({ limit: 2, after: first.next }));

    expect(second.items.map((view) => view.space.id)).toEqual([SUPPORT]);
    expect(second.next).toBeNull();
  });

  it('walks every visible space once, whatever the page size', async () => {
    const list = new ListSpaces(atelierNord(), atelierNordMembers());
    const seen: string[] = [];
    let after = null;
    do {
      const page = await list.execute(listSpaces({ actorUserId: HUGO, limit: 1, after }));
      seen.push(...page.items.map((view) => view.space.prefix));
      after = page.next;
    } while (after !== null);

    expect(seen).toEqual(['CAD', 'DES', 'MKT', 'SUP']);
  });

  it('reads the next numbers once per page, for the prefixes of that page only', async () => {
    const spaces = atelierNord();

    await new ListSpaces(spaces, atelierNordMembers()).execute(listSpaces({ limit: 2 }));

    expect(spaces.nextNumbersCalls).toEqual([['CAD', 'MKT']]);
  });

  it('reads the next numbers once for a page of many spaces', async () => {
    const spaces = atelierNord();

    await new ListSpaces(spaces, atelierNordMembers()).execute(listSpaces({ actorUserId: HUGO }));

    expect(spaces.nextNumbersCalls).toHaveLength(1);
  });
});

describe('ListSpaces: a guest sees no space and a stranger no organization', () => {
  it('answers an empty page to a guest, without reading any space', async () => {
    const spaces = atelierNord();

    const page = await new ListSpaces(spaces, atelierNordMembers()).execute(
      listSpaces({ actorUserId: NADIA }),
    );

    expect(page).toEqual({ items: [], next: null });
    expect(spaces.listVisibleCalls).toEqual([]);
    expect(spaces.nextNumbersCalls).toEqual([]);
  });

  it('refuses an account the copy of the members does not know with organization-not-found', async () => {
    const refusal = await refusalOf(
      new ListSpaces(atelierNord(), atelierNordMembers()).execute(
        listSpaces({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('ListSpaces: a read does not lock the membership of the caller', () => {
  it('asks the directory for the role of the caller without the lock', async () => {
    const members = atelierNordMembers();

    await new ListSpaces(atelierNord(), members).execute(listSpaces());

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: LEA, lock: false }]);
  });
});
