import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  STRANGER,
  UNKNOWN_SPACE,
  atelierNordMembers,
  designState,
  refusalOf,
  spaceState,
} from '../../../spaces.fixture.js';
import type { GetSpaceInput } from './get-space.input.js';
import { GetSpace } from './get-space.use-case.js';

/**
 * Builds the reading of the space "Produit" by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function getProduit(overrides: Partial<GetSpaceInput> = {}): GetSpaceInput {
  return { organizationId: ATELIER_NORD, actorUserId: LEA, spaceId: PRODUIT, ...overrides };
}

/** Atelier Nord with "Produit" (CAD) and the private "Design" (DES, Hugo Dubois). */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lastNumbers: { CAD: 481 },
  });
}

describe('GetSpace: a member reads a space they see, with its next key', () => {
  it('returns Produit with the key CAD-482 for its next task', async () => {
    const view = await new GetSpace(atelierNord(), atelierNordMembers()).execute(getProduit());

    expect(view).toEqual({ space: spaceState(), nextKey: 'CAD-482' });
  });

  it('starts the numbering at 1 for a space with no task yet', async () => {
    const view = await new GetSpace(atelierNord(), atelierNordMembers()).execute(
      getProduit({ actorUserId: HUGO, spaceId: DESIGN }),
    );

    expect(view.nextKey).toBe('DES-1');
  });

  it('reads the next number of that space only, once', async () => {
    const spaces = atelierNord();

    await new GetSpace(spaces, atelierNordMembers()).execute(getProduit());

    expect(spaces.nextNumbersCalls).toEqual([['CAD']]);
  });
});

describe('GetSpace: a space the caller does not see answers as an unknown one does', () => {
  it.each([
    ['the owner of the organization', CAMILLE],
    ['an admin', INES],
    ['another member', LEA],
  ])('hides the private Design from %s', async (_who: string, actorUserId: string) => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute(
        getProduit({ actorUserId, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
    expect(spaces.nextNumbersCalls).toEqual([]);
  });

  it('hides an organization space from a guest', async () => {
    const refusal = await refusalOf(
      new GetSpace(atelierNord(), atelierNordMembers()).execute(getProduit({ actorUserId: NADIA })),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers the same for a space that does not exist', async () => {
    const refusal = await refusalOf(
      new GetSpace(atelierNord(), atelierNordMembers()).execute(
        getProduit({ spaceId: UNKNOWN_SPACE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers the same for a space of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
    });

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute(getProduit()),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new GetSpace(atelierNord(), atelierNordMembers()).execute(
        getProduit({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('GetSpace: a read does not lock the membership of the caller', () => {
  it('asks the directory for the role of the caller without the lock', async () => {
    const members = atelierNordMembers();

    await new GetSpace(atelierNord(), members).execute(getProduit());

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: LEA, lock: false }]);
  });
});
