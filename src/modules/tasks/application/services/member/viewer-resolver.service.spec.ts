import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  NADIA,
  OTHER_ORGANIZATION,
  STRANGER,
  atelierNordMembers,
  refusalOf,
} from '../../use-cases/tasks.fixture.js';
import { ViewerResolver } from './viewer-resolver.service.js';

describe('ViewerResolver: the caller is a member of the organization, known to the copy', () => {
  it('resolves the owner of the organization, a member and a guest with the role of the copy', async () => {
    const resolver = new ViewerResolver(atelierNordMembers());

    expect(await resolver.resolve(ATELIER_NORD, CAMILLE)).toEqual({
      userId: CAMILLE,
      role: 'owner',
    });
    expect(await resolver.resolve(ATELIER_NORD, HUGO)).toEqual({ userId: HUGO, role: 'member' });
    expect(await resolver.resolve(ATELIER_NORD, NADIA)).toEqual({ userId: NADIA, role: 'guest' });
  });

  it.each([
    ['an account the copy does not know', ATELIER_NORD, STRANGER],
    ['a member of Atelier Nord who asks for another organization', OTHER_ORGANIZATION, CAMILLE],
  ])('refuses %s as organization-not-found', async (_name, organizationId, userId) => {
    const refusal = await refusalOf(
      new ViewerResolver(atelierNordMembers()).resolve(organizationId, userId),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('ViewerResolver: the lock flag reaches the directory, off unless asked', () => {
  it('reads without a lock by default and with one in a write', async () => {
    const members = atelierNordMembers();
    const resolver = new ViewerResolver(members);

    await resolver.resolve(ATELIER_NORD, HUGO);
    await resolver.resolve(ATELIER_NORD, HUGO, true);

    expect(members.roleCalls).toEqual([
      { userId: HUGO, lock: false },
      { userId: HUGO, lock: true },
    ]);
  });
});
