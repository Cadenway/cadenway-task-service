import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  CAMILLE_MEMBERSHIP,
  INES,
  INES_MEMBERSHIP,
  InMemoryMemberships,
  OCCURRED_AT,
  OTHER_ORGANIZATION,
  membershipState,
} from '../../../memberships.fixture.js';
import { FindOrganizationOwner } from './find-organization-owner.use-case.js';

/** The copy of Atelier Nord: Camille Martin owns it and Inès Robert is an admin. */
function atelierNord(): InMemoryMemberships {
  return new InMemoryMemberships([
    membershipState({ id: INES_MEMBERSHIP, userId: INES, role: 'admin' }),
    membershipState({ id: CAMILLE_MEMBERSHIP, userId: CAMILLE, role: 'owner' }),
  ]);
}

describe('FindOrganizationOwner: the owner of an organization comes from the copy', () => {
  it('returns the membership and the account of the active owner', async () => {
    const owner = await new FindOrganizationOwner(atelierNord()).execute({
      organizationId: ATELIER_NORD,
    });

    expect(owner).toEqual({ memberId: CAMILLE_MEMBERSHIP, userId: CAMILLE });
  });

  it('returns null while the join of the owner has not reached the copy', async () => {
    const store = new InMemoryMemberships([
      membershipState({ id: INES_MEMBERSHIP, userId: INES, role: 'admin' }),
    ]);

    const owner = await new FindOrganizationOwner(store).execute({ organizationId: ATELIER_NORD });

    expect(owner).toBeNull();
  });

  it('returns null when the owner membership is removed', async () => {
    const store = new InMemoryMemberships([
      membershipState({
        id: CAMILLE_MEMBERSHIP,
        userId: CAMILLE,
        role: 'owner',
        version: 2,
        removedAt: OCCURRED_AT,
      }),
    ]);

    const owner = await new FindOrganizationOwner(store).execute({ organizationId: ATELIER_NORD });

    expect(owner).toBeNull();
  });

  it('returns null for an organization whose owner the copy does not hold', async () => {
    const owner = await new FindOrganizationOwner(atelierNord()).execute({
      organizationId: OTHER_ORGANIZATION,
    });

    expect(owner).toBeNull();
  });

  it('passes the organization of the input to the repository', async () => {
    const store = atelierNord();

    await new FindOrganizationOwner(store).execute({ organizationId: ATELIER_NORD });

    expect(store.activeOwnerCalls).toEqual([ATELIER_NORD]);
  });
});
