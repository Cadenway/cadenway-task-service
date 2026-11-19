import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  HUGO,
  InMemorySpaces,
  LEA,
  NADIA,
  PRODUIT,
  SPRINT_14,
  atelierNordMembers,
  listGrantOf,
  refusalOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { ListListGrantsInput } from './list-list-grants.input.js';
import { ListListGrants } from './list-list-grants.use-case.js';

/**
 * Builds the first page of the grants of Sprint 14 read by the guest Nadia Benali.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function grantsOfSprint(overrides: Partial<ListListGrantsInput> = {}): ListListGrantsInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: NADIA,
    listId: SPRINT_14,
    after: null,
    limit: 50,
    ...overrides,
  };
}

/** Sprint 14 (switch off) shared with Léa Petit and Nadia Benali. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState()],
    lists: [sprintState({ organizationAccess: false })],
    grants: [
      listGrantOf(PRODUIT, SPRINT_14, LEA, 'edit'),
      listGrantOf(PRODUIT, SPRINT_14, NADIA, 'view', {
        createdAt: new Date('2026-03-05T09:00:00Z'),
      }),
    ],
  });
}

describe('ListListGrants: any role on the list reads its grants ("Personnes ayant accès")', () => {
  it('lists to a guest with view every grant of the list, with their total', async () => {
    const page = await new ListListGrants(atelierNord(), atelierNordMembers()).execute(
      grantsOfSprint(),
    );

    expect(page.items.map((grant) => [grant.userId, grant.role])).toEqual([
      [LEA, 'edit'],
      [NADIA, 'view'],
    ]);
    expect(page).toMatchObject({ next: null, total: 2 });
  });

  it('answers list-not-found to a member of the organization when the switch is off and nothing is shared', async () => {
    const refusal = await refusalOf(
      new ListListGrants(atelierNord(), atelierNordMembers()).execute(
        grantsOfSprint({ actorUserId: HUGO }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });
});
