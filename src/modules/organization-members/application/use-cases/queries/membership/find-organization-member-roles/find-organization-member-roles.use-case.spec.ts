import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  HUGO_MEMBERSHIP,
  InMemoryMemberships,
  LEA,
  LEA_MEMBERSHIP,
  OCCURRED_AT,
  OTHER_ORGANIZATION,
  membershipState,
} from '../../../memberships.fixture.js';
import { FindOrganizationMemberRoles } from './find-organization-member-roles.use-case.js';

describe('FindOrganizationMemberRoles', () => {
  it('resolves the least privileged active tenant membership once per requested account', async () => {
    const store = new InMemoryMemberships([
      membershipState({ id: HUGO_MEMBERSHIP, role: 'admin', version: 3 }),
      membershipState({ id: LEA_MEMBERSHIP, role: 'guest', version: 1 }),
      membershipState({ id: 'removed', userId: LEA, removedAt: OCCURRED_AT, role: 'admin' }),
      membershipState({ id: 'foreign', organizationId: OTHER_ORGANIZATION, userId: CAMILLE }),
    ]);
    const useCase = new FindOrganizationMemberRoles(store);
    await expect(
      useCase.execute({
        organizationId: ATELIER_NORD,
        userIds: [HUGO, LEA, HUGO, CAMILLE],
        lock: true,
      }),
    ).resolves.toEqual([
      { userId: HUGO, role: 'guest' },
      { userId: LEA, role: null },
      { userId: CAMILLE, role: null },
    ]);
  });
});
