import { describe, expect, it } from 'vitest';

import { Membership } from '../../aggregates/membership/membership.aggregate.js';
import type { MemberRole } from '../../value-objects/membership/member-role.value-object.js';
import { leastPrivilegedMembership } from './least-privileged-membership.policy.js';

/** Atelier Nord, the organization of the mockup. */
const ATELIER_NORD = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Inès Robert (IR), who left Atelier Nord and joined it again. */
const INES = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

/** Her membership before the removal, which the copy has not seen removed yet. */
const OLD_MEMBERSHIP = '019a6b10-0000-7000-8000-0000000000b1';

/** Her membership since she joined again. */
const NEW_MEMBERSHIP = '019a6b10-0000-7000-8000-0000000000b2';

/**
 * Builds an active membership of Inès Robert.
 *
 * @param id - The `memberId`.
 * @param role - Its role.
 * @returns The membership.
 */
function active(id: string, role: MemberRole): Membership {
  return Membership.restore({
    id,
    organizationId: ATELIER_NORD,
    userId: INES,
    role,
    version: 1,
    removedAt: null,
  });
}

describe('leastPrivilegedMembership: a stale membership never grants more than the current one', () => {
  it('answers nothing for an account without an active membership', () => {
    expect(leastPrivilegedMembership([])).toBeNull();
  });

  it('answers the only active membership', () => {
    const only: Membership = active(NEW_MEMBERSHIP, 'admin');

    expect(leastPrivilegedMembership([only])).toBe(only);
  });

  it.each([
    ['the new one first', true],
    ['the stale one first', false],
  ])(
    'answers the guest role over the admin role whatever the order, %s',
    (_order: string, newFirst: boolean) => {
      const stale: Membership = active(OLD_MEMBERSHIP, 'admin');
      const current: Membership = active(NEW_MEMBERSHIP, 'guest');

      const chosen: Membership | null = leastPrivilegedMembership(
        newFirst ? [current, stale] : [stale, current],
      );

      expect(chosen).toBe(current);
    },
  );

  it('ranks guest, member, admin, then owner', () => {
    const roles: readonly MemberRole[] = ['owner', 'admin', 'member', 'guest'];

    const chosen: Membership | null = leastPrivilegedMembership(
      roles.map((role: MemberRole, index: number) =>
        active(`${OLD_MEMBERSHIP}-${String(index)}`, role),
      ),
    );

    expect(chosen?.snapshot.role).toBe('guest');
  });

  it('keeps the first given among equal roles', () => {
    const first: Membership = active(NEW_MEMBERSHIP, 'member');
    const second: Membership = active(OLD_MEMBERSHIP, 'member');

    expect(leastPrivilegedMembership([first, second])).toBe(first);
  });
});
