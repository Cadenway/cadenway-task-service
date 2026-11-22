import { describe, expect, it, vi } from 'vitest';

import type { MembershipRebuildItem } from '../../../../models/membership/membership-rebuild-item.model.js';
import { RebuildMemberships } from './rebuild-memberships.use-case.js';

const updatedAt = new Date('2026-06-02T10:00:00.000Z');
const owner: MembershipRebuildItem = {
  organizationId: '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10',
  memberId: '01938f6e-9000-7000-8000-0000000000c1',
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24',
  role: 'owner',
  version: 1,
  removedAt: null,
  updatedAt,
};
const formerGuest: MembershipRebuildItem = {
  ...owner,
  memberId: '01938f6e-9000-7000-8000-0000000000c2',
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c25',
  role: 'guest',
  version: 2,
  removedAt: updatedAt,
};

async function* page(...items: MembershipRebuildItem[]): AsyncGenerator<MembershipRebuildItem> {
  yield* await Promise.resolve(items);
}

describe('RebuildMemberships', () => {
  it('restores an active owner and a terminal generation using the normal command', async () => {
    const oldGuest = { ...formerGuest, version: 1, removedAt: null };
    const apply = vi.fn().mockResolvedValue(undefined);
    const command = new RebuildMemberships((verify) => verify(page(oldGuest)), apply);

    await expect(command.execute(() => page(owner, formerGuest))).resolves.toBe(2);
    expect(apply).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'role-changed', ...pick(owner) }),
    );
    expect(apply).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'removed', ...pick(formerGuest) }),
    );
  });

  it('finishes reading the first pass before issuing any write', async () => {
    async function* interrupted(): AsyncGenerator<MembershipRebuildItem> {
      yield await Promise.resolve(owner);
      throw new Error('The input never finished.');
    }
    const apply = vi.fn();
    const command = new RebuildMemberships((verify) => verify(page()), apply);
    await expect(command.execute(interrupted)).rejects.toThrow('The input never finished.');
    expect(apply).not.toHaveBeenCalled();
  });

  it.each([
    ['missing membership', { ...formerGuest, memberId: '01938f6e-9000-7000-8000-0000000000c3' }],
    ['higher local version', { ...formerGuest, version: 3 }],
    ['different account', { ...formerGuest, userId: owner.userId }],
  ])('refuses a projection with a %s before any write', async (_name, projection) => {
    const apply = vi.fn();
    const command = new RebuildMemberships((verify) => verify(page(projection)), apply);
    await expect(command.execute(() => page(owner, formerGuest))).rejects.toThrow(
      /Organization snapshot/u,
    );
    expect(apply).not.toHaveBeenCalled();
  });
});

function pick({ organizationId, memberId, userId, role, version }: MembershipRebuildItem) {
  return { organizationId, memberId, userId, role, version };
}
