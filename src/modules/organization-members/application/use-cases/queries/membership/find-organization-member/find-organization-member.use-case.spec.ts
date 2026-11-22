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

  it('refuses to bind a grant when two active membership generations exist', async () => {
    const store = new InMemoryMemberships([
      membershipState({ id: HUGO_MEMBERSHIP, role: 'admin', version: 3 }),
      membershipState({ id: LEA_MEMBERSHIP, role: 'guest', version: 1 }),
    ]);

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      lock: true,
      unique: true,
    });

    expect(member).toBeNull();
    expect(store.activeByUserLocks).toEqual([true]);
  });

  it('returns the single active generation for a grant even with a removed historical membership', async () => {
    const store = new InMemoryMemberships([
      membershipState({ id: HUGO_MEMBERSHIP, role: 'admin', version: 3 }),
      membershipState({ id: LEA_MEMBERSHIP, role: 'guest', version: 2, removedAt: OCCURRED_AT }),
    ]);

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      lock: true,
      unique: true,
    });

    expect(member).toEqual({ memberId: HUGO_MEMBERSHIP, role: 'admin' });
    expect(store.activeByUserLocks).toEqual([true]);
  });

  it('returns the version of the selected active membership alongside its ID and role', async () => {
    const store = new InMemoryMemberships([
      membershipState({ id: HUGO_MEMBERSHIP, role: 'admin', version: 9 }),
      membershipState({ id: LEA_MEMBERSHIP, role: 'guest', version: 3 }),
    ]);

    const stamp = await new FindOrganizationMember(store).stamp({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(stamp).toEqual({ memberId: LEA_MEMBERSHIP, role: 'guest', version: 3 });
    expect(store.activeByUserLocks).toEqual([false]);
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

describe('FindOrganizationMember: a write asks for the membership under a lock, a read does not', () => {
  it('reads without a lock when the input does not say', async () => {
    const store = new InMemoryMemberships([membershipState()]);

    await new FindOrganizationMember(store).execute({ organizationId: ATELIER_NORD, userId: HUGO });

    expect(store.activeByUserLocks).toEqual([false]);
  });

  it('reads without a lock when the input says so', async () => {
    const store = new InMemoryMemberships([membershipState()]);

    await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      lock: false,
    });

    expect(store.activeByUserLocks).toEqual([false]);
  });

  it('passes the lock to the repository', async () => {
    const store = new InMemoryMemberships([membershipState()]);

    await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      lock: true,
    });

    expect(store.activeByUserLocks).toEqual([true]);
  });

  it('answers the same member whether or not the read is locked', async () => {
    const store = new InMemoryMemberships([membershipState({ role: 'admin', version: 2 })]);
    const find = new FindOrganizationMember(store);

    const unlocked = await find.execute({ organizationId: ATELIER_NORD, userId: HUGO });
    const locked = await find.execute({ organizationId: ATELIER_NORD, userId: HUGO, lock: true });

    expect(locked).toEqual(unlocked);
    expect(locked).toEqual({ memberId: HUGO_MEMBERSHIP, role: 'admin' });
  });

  it('locks the read of an account that is not a member, and answers null', async () => {
    const store = new InMemoryMemberships();

    const member = await new FindOrganizationMember(store).execute({
      organizationId: ATELIER_NORD,
      userId: LEA,
      lock: true,
    });

    expect(member).toBeNull();
    expect(store.activeByUserLocks).toEqual([true]);
  });
});
