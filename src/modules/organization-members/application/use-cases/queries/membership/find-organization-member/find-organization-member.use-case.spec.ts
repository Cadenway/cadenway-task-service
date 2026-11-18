import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  CAMILLE_MEMBERSHIP,
  HUGO,
  HUGO_MEMBERSHIP,
  INES,
  InMemoryMemberships,
  LEA,
  LEA_MEMBERSHIP,
  OCCURRED_AT,
  OTHER_ORGANIZATION,
  membershipState,
} from '../../../memberships.fixture.js';
import { FindOrganizationMember } from './find-organization-member.use-case.js';

describe('FindOrganizationMember: an account is a member from the copy, with its role', () => {
  it('returns the id and the role of the active membership', async () => {
    const store = new InMemoryMemberships([membershipState({ role: 'admin', version: 2 })]);

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(member).toEqual({ memberId: HUGO_MEMBERSHIP, role: 'admin' });
  });

  it('returns the owner role of Camille Martin', async () => {
    const store = new InMemoryMemberships([
      membershipState({ id: CAMILLE_MEMBERSHIP, userId: CAMILLE, role: 'owner' }),
    ]);

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: CAMILLE,
    });

    expect(member).toEqual({ memberId: CAMILLE_MEMBERSHIP, role: 'owner' });
  });

  it('returns null when the copy holds no membership of the account', async () => {
    const store = new InMemoryMemberships([membershipState()]);

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: LEA,
    });

    expect(member).toBeNull();
  });

  it('returns null for a removed membership', async () => {
    const store = new InMemoryMemberships([
      membershipState({ version: 2, removedAt: OCCURRED_AT }),
    ]);

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(member).toBeNull();
  });

  it('returns null for an account that is a member of another organization only', async () => {
    const store = new InMemoryMemberships([
      membershipState({ organizationId: OTHER_ORGANIZATION }),
    ]);

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(member).toBeNull();
  });

  it('answers the least privileged of two active memberships of the account', async () => {
    const store = new InMemoryMemberships([
      membershipState({ id: HUGO_MEMBERSHIP, role: 'admin', version: 3 }),
      membershipState({ id: LEA_MEMBERSHIP, role: 'guest', version: 1 }),
    ]);

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(member).toEqual({ memberId: LEA_MEMBERSHIP, role: 'guest' });
  });

  it('passes the organization and the account of the input to the repository', async () => {
    const store = new InMemoryMemberships();

    await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: INES,
    });

    expect(store.activeByUserCalls).toEqual([{ organizationId: ATELIER_NORD, userId: INES }]);
  });
});
