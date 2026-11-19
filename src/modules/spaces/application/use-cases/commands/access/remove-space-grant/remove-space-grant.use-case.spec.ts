import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  PRODUIT,
  atelierNordMembers,
  designState,
  refusalOf,
  spaceGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import type { RemoveSpaceGrantInput } from './remove-space-grant.input.js';
import { RemoveSpaceGrant } from './remove-space-grant.use-case.js';

/**
 * Builds Camille Martin, owner of Produit, removing the grant of Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function unshare(overrides: Partial<RemoveSpaceGrantInput> = {}): RemoveSpaceGrantInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    spaceId: PRODUIT,
    userId: LEA,
    expectedVersions: null,
    ...overrides,
  };
}

/** Atelier Nord: Produit (version 5) shared with Inès Robert and Léa Petit, the private Design. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState({ version: 5 }), designState()],
    grants: [spaceGrantOf(PRODUIT, INES, 'view'), spaceGrantOf(PRODUIT, LEA, 'edit')],
  });
}

describe('RemoveSpaceGrant: who manages a space removes the grant of a person', () => {
  it('removes the grant, takes the next version and appends space.access-changed with the grants left', async () => {
    const spaces = atelierNord();

    const removed = await new RemoveSpaceGrant(spaces, atelierNordMembers()).execute(unshare());

    expect(removed).toEqual({ version: 6 });
    expect(spaces.grantsOf({ kind: 'space', spaceId: PRODUIT })).toEqual([
      { userId: INES, role: 'view' },
    ]);
    expect(spaces.events).toEqual([
      {
        kind: 'spaceAccessChanged',
        spaceId: PRODUIT,
        version: 6,
        grants: [{ userId: INES, role: 'view' }],
        changedUserIds: [LEA],
        actor: { type: 'user', id: CAMILLE },
      },
    ]);
  });

  it('answers the same version for a person without a grant, writing and emitting nothing', async () => {
    const spaces = atelierNord();

    const removed = await new RemoveSpaceGrant(spaces, atelierNordMembers()).execute(
      unshare({ userId: HUGO }),
    );

    expect(removed).toEqual({ version: 5 });
    expect(spaces.events).toEqual([]);
  });

  it('refuses owner-unchangeable for the owner of the space', async () => {
    const refusal = await refusalOf(
      new RemoveSpaceGrant(atelierNord(), atelierNordMembers()).execute(
        unshare({ actorUserId: INES, userId: CAMILLE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'owner-unchangeable' });
  });

  it('refuses manage-forbidden to a member who does not manage the space, before If-Match', async () => {
    const refusal = await refusalOf(
      new RemoveSpaceGrant(atelierNord(), atelierNordMembers()).execute(
        unshare({ actorUserId: LEA, expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'manage-forbidden' });
  });

  it('refuses a stale If-Match with the version of the space', async () => {
    const refusal = await refusalOf(
      new RemoveSpaceGrant(atelierNord(), atelierNordMembers()).execute(
        unshare({ expectedVersions: [4] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 5 });
  });

  it('answers space-not-found for a private space the actor does not see', async () => {
    const refusal = await refusalOf(
      new RemoveSpaceGrant(atelierNord(), atelierNordMembers()).execute(
        unshare({ spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('locks the membership of the actor only, then the space', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    await new RemoveSpaceGrant(spaces, members).execute(unshare());

    expect(spaces.journal).toEqual([`membership ${CAMILLE}`, `space ${PRODUIT}`]);
  });
});
