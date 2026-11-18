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
} from '../../use-cases/spaces.fixture.js';
import { ViewerResolver } from './viewer-resolver.service.js';

describe('ViewerResolver: the caller is a member of the organization, known to the copy', () => {
  it('resolves the owner of the organization with the role of the copy', async () => {
    const viewer = await new ViewerResolver(atelierNordMembers()).resolve(ATELIER_NORD, CAMILLE);

    expect(viewer).toEqual({ userId: CAMILLE, role: 'owner' });
  });

  it('resolves a member and a guest with their own role', async () => {
    const resolver = new ViewerResolver(atelierNordMembers());

    expect(await resolver.resolve(ATELIER_NORD, HUGO)).toEqual({ userId: HUGO, role: 'member' });
    expect(await resolver.resolve(ATELIER_NORD, NADIA)).toEqual({ userId: NADIA, role: 'guest' });
  });

  it('refuses an account the copy does not know as organization-not-found', async () => {
    const refusal = await refusalOf(
      new ViewerResolver(atelierNordMembers()).resolve(ATELIER_NORD, STRANGER),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });

  it('refuses a member of Atelier Nord who asks for another organization', async () => {
    const refusal = await refusalOf(
      new ViewerResolver(atelierNordMembers()).resolve(OTHER_ORGANIZATION, CAMILLE),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('ViewerResolver: the lock flag reaches the directory, off unless asked', () => {
  it('reads without a lock by default', async () => {
    const members = atelierNordMembers();

    await new ViewerResolver(members).resolve(ATELIER_NORD, HUGO);

    expect(members.roleCalls).toEqual([
      { organizationId: ATELIER_NORD, userId: HUGO, lock: false },
    ]);
  });

  it('passes the lock a write asks for', async () => {
    const members = atelierNordMembers();

    await new ViewerResolver(members).resolve(ATELIER_NORD, HUGO, true);

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: HUGO, lock: true }]);
  });

  it('passes the lock even for an account the copy does not know', async () => {
    const members = atelierNordMembers();

    await refusalOf(new ViewerResolver(members).resolve(ATELIER_NORD, STRANGER, true));

    expect(members.roleCalls).toEqual([
      { organizationId: ATELIER_NORD, userId: STRANGER, lock: true },
    ]);
  });
});
