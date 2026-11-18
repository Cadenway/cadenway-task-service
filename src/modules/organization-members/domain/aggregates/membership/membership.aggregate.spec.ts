import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import { InvalidMembershipStateError } from '../../errors/membership/invalid-membership-state.error.js';
import { MembershipMismatchError } from '../../errors/membership/membership-mismatch.error.js';
import type { MemberRole } from '../../value-objects/membership/member-role.value-object.js';
import type { MembershipChange } from '../../value-objects/membership/membership-change.value-object.js';
import type { MembershipState } from '../../value-objects/membership/membership-state.value-object.js';
import { Membership } from './membership.aggregate.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Another organization than Atelier Nord, for the events that must be refused. */
const OTHER_ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99';

/** Account of Hugo Dubois (HD), whose membership the specs follow. */
const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** Account of Inès Robert (IR), another member of Atelier Nord. */
const INES = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

/** Membership of Hugo Dubois in Atelier Nord. */
const HUGO_MEMBERSHIP = '019a6b10-0000-7000-8000-000000000003';

const JOINED_AT: Date = new Date('2026-11-03T08:30:00Z');
const REMOVED_AT: Date = new Date('2026-11-12T16:45:00Z');

/**
 * Builds an event of the membership of Hugo Dubois in Atelier Nord.
 *
 * @param kind - Which event.
 * @param version - Version after the change.
 * @param role - Role after the change.
 * @param overrides - Fields to replace, to name another account or organization.
 * @returns The event.
 */
function change(
  kind: MembershipChange['kind'],
  version: number,
  role: MemberRole,
  overrides: Partial<MembershipChange> = {},
): MembershipChange {
  return {
    kind,
    memberId: HUGO_MEMBERSHIP,
    organizationId: ATELIER_NORD,
    userId: HUGO,
    role,
    version,
    occurredAt: kind === 'removed' ? REMOVED_AT : JOINED_AT,
    ...overrides,
  };
}

/**
 * Builds a stored state of the membership of Hugo Dubois.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
function state(overrides: Partial<MembershipState> = {}): MembershipState {
  return {
    id: HUGO_MEMBERSHIP,
    organizationId: ATELIER_NORD,
    userId: HUGO,
    role: 'member',
    version: 1,
    removedAt: null,
    ...overrides,
  };
}

describe('Membership.begin: the first event seen creates the copy, whichever it is', () => {
  it('begins an active copy from the join', () => {
    const membership: Membership = Membership.begin(change('joined', 1, 'member'));

    expect(membership.snapshot).toEqual(state());
    expect(membership.isActive).toBe(true);
  });

  it('begins an active copy from a role change seen before the join', () => {
    const membership: Membership = Membership.begin(change('role-changed', 3, 'admin'));

    expect(membership.snapshot).toEqual(state({ role: 'admin', version: 3 }));
    expect(membership.isActive).toBe(true);
  });

  it('begins a removed copy from a removal seen first', () => {
    const membership: Membership = Membership.begin(change('removed', 4, 'guest'));

    expect(membership.snapshot).toEqual(
      state({ role: 'guest', version: 4, removedAt: REMOVED_AT }),
    );
    expect(membership.isActive).toBe(false);
  });

  it('refuses an event whose version is not a positive integer', () => {
    expect(() => Membership.begin(change('joined', 0, 'member'))).toThrow(
      InvalidMembershipStateError,
    );
  });
});

describe('Membership.apply: the version orders the events of a membership', () => {
  it('applies a role change newer than the copy', () => {
    const applied: Membership = Membership.begin(change('joined', 1, 'member')).apply(
      change('role-changed', 2, 'admin'),
    );

    expect(applied.snapshot).toEqual(state({ role: 'admin', version: 2 }));
    expect(applied.isActive).toBe(true);
  });

  it('applies a role change that skips versions, as when an event is still on its way', () => {
    const applied: Membership = Membership.begin(change('joined', 1, 'member')).apply(
      change('role-changed', 4, 'guest'),
    );

    expect(applied.snapshot).toMatchObject({ role: 'guest', version: 4 });
  });

  it('ignores a role change of the version the copy already holds', () => {
    const copy: Membership = Membership.begin(change('role-changed', 2, 'admin'));

    expect(copy.apply(change('role-changed', 2, 'guest'))).toBe(copy);
  });

  it('ignores a role change older than the copy', () => {
    const copy: Membership = Membership.begin(change('role-changed', 3, 'admin'));

    expect(copy.apply(change('role-changed', 2, 'guest'))).toBe(copy);
  });

  it('ignores a late join once a role change began the copy', () => {
    const copy: Membership = Membership.begin(change('role-changed', 2, 'admin'));

    expect(copy.apply(change('joined', 1, 'member'))).toBe(copy);
  });

  it('does not change the copy it was called on', () => {
    const copy: Membership = Membership.begin(change('joined', 1, 'member'));

    copy.apply(change('role-changed', 2, 'admin'));

    expect(copy.snapshot).toEqual(state());
  });
});

describe('Membership.apply: a removal is the last change of a membership', () => {
  it('removes an active copy and keeps the role of the removal', () => {
    const removed: Membership = Membership.begin(change('joined', 1, 'member')).apply(
      change('removed', 3, 'admin'),
    );

    expect(removed.snapshot).toEqual(state({ role: 'admin', version: 3, removedAt: REMOVED_AT }));
    expect(removed.isActive).toBe(false);
  });

  it('applies a removal whatever version came before it', () => {
    const removed: Membership = Membership.begin(change('role-changed', 2, 'admin')).apply(
      change('removed', 3, 'admin'),
    );

    expect(removed.snapshot.removedAt).toEqual(REMOVED_AT);
    expect(removed.isActive).toBe(false);
  });

  it('removes the copy when the removal is older than the copy and keeps the role of the highest version', () => {
    const removed: Membership = Membership.begin(change('role-changed', 4, 'admin')).apply(
      change('removed', 2, 'member'),
    );

    expect(removed.snapshot).toEqual(state({ role: 'admin', version: 4, removedAt: REMOVED_AT }));
    expect(removed.isActive).toBe(false);
  });

  it('keeps the version already applied when a removal of the same version arrives', () => {
    const removed: Membership = Membership.begin(change('role-changed', 3, 'admin')).apply(
      change('removed', 3, 'admin'),
    );

    expect(removed.snapshot).toMatchObject({ role: 'admin', version: 3, removedAt: REMOVED_AT });
  });

  it('never brings a removed membership back with a late join', () => {
    const removed: Membership = Membership.begin(change('removed', 2, 'member'));

    expect(removed.apply(change('joined', 1, 'member'))).toBe(removed);
  });

  it('never changes a removed membership with a late role change, whatever its version', () => {
    const removed: Membership = Membership.begin(change('removed', 3, 'member'));

    expect(removed.apply(change('role-changed', 2, 'admin'))).toBe(removed);
    expect(removed.apply(change('role-changed', 9, 'admin'))).toBe(removed);
  });

  it('keeps the first removal when a second one arrives', () => {
    const removed: Membership = Membership.begin(change('removed', 3, 'member'));
    const later: Date = new Date('2026-11-20T09:00:00Z');

    expect(removed.apply(change('removed', 5, 'admin', { occurredAt: later }))).toBe(removed);
  });
});

describe('Membership.apply: a membership never moves', () => {
  it('refuses an event that names another organization', () => {
    const copy: Membership = Membership.begin(change('joined', 1, 'member'));

    expect(() =>
      copy.apply(change('role-changed', 2, 'admin', { organizationId: OTHER_ORGANIZATION })),
    ).toThrow(MembershipMismatchError);
  });

  it('refuses an event that names another account', () => {
    const copy: Membership = Membership.begin(change('joined', 1, 'member'));

    expect(() => copy.apply(change('role-changed', 2, 'admin', { userId: INES }))).toThrow(
      MembershipMismatchError,
    );
  });

  it('refuses a mismatched event even when its version is older than the copy', () => {
    const copy: Membership = Membership.begin(change('role-changed', 3, 'admin'));

    expect(() => copy.apply(change('joined', 1, 'member', { userId: INES }))).toThrow(
      MembershipMismatchError,
    );
  });

  it('refuses a mismatched event on a removed membership', () => {
    const removed: Membership = Membership.begin(change('removed', 2, 'member'));

    expect(() => removed.apply(change('role-changed', 3, 'admin', { userId: INES }))).toThrow(
      MembershipMismatchError,
    );
  });

  it('ends the membership on a removal that names another account, keeping its own account', () => {
    const copy: Membership = Membership.begin(change('role-changed', 2, 'admin'));

    const removed: Membership = copy.apply(change('removed', 3, 'admin', { userId: INES }));

    expect(removed.isActive).toBe(false);
    expect(removed.snapshot).toMatchObject({
      userId: copy.snapshot.userId,
      version: 3,
      removedAt: REMOVED_AT,
    });
  });

  it('still refuses a removal that names another organization', () => {
    const copy: Membership = Membership.begin(change('joined', 1, 'member'));

    expect(() =>
      copy.apply(change('removed', 2, 'member', { organizationId: OTHER_ORGANIZATION })),
    ).toThrow(MembershipMismatchError);
  });
});

describe('Membership.restore: a stored version is a positive integer', () => {
  it.each([0, -1, 1.5, Number.NaN])('refuses the version %s', (version: number) => {
    expect(() => Membership.restore(state({ version }))).toThrow(InvalidMembershipStateError);
  });

  it('restores a valid state unchanged', () => {
    const stored: MembershipState = state({ role: 'guest', version: 7, removedAt: REMOVED_AT });

    expect(Membership.restore(stored).snapshot).toEqual(stored);
  });

  it('refuses a change whose version is not an integer when it would change the copy', () => {
    const copy: Membership = Membership.begin(change('joined', 1, 'member'));

    expect(() => copy.apply(change('removed', 1.5, 'member'))).toThrow(InvalidMembershipStateError);
  });
});

/** The roles an account holds in an organization, as the property test draws them. */
const roleArbitrary: fc.Arbitrary<MemberRole> = fc.constantFrom<MemberRole>(
  'owner',
  'admin',
  'member',
  'guest',
);

/** One consistent history of the membership of Hugo Dubois, and the events a consumer receives. */
interface DeliveredHistory {
  // #region Properties
  /**
   * Property ordered
   *
   * @description
   * The events of the history in the order of their versions.
   *
   * @type {readonly MembershipChange[]}
   * @readonly
   */
  readonly ordered: readonly MembershipChange[];

  /**
   * Property delivered
   *
   * @description
   * The same events in any order, with duplicates, each of them at least once.
   *
   * @type {readonly MembershipChange[]}
   * @readonly
   */
  readonly delivered: readonly MembershipChange[];
  // #endregion
}

/**
 * Draws a consistent history of one membership (joined v1, role changes v2..vn, optionally a
 * removal at vn+1 holding the role of vn) and a delivery of it: a permutation of its events with
 * duplicates.
 */
const historyArbitrary: fc.Arbitrary<DeliveredHistory> = fc
  .tuple(fc.array(roleArbitrary, { minLength: 1, maxLength: 6 }), fc.boolean())
  .chain(([roles, removed]: readonly [MemberRole[], boolean]) => {
    const ordered: MembershipChange[] = roles.map(
      (role: MemberRole, index: number): MembershipChange =>
        change(index === 0 ? 'joined' : 'role-changed', index + 1, role),
    );
    const last: MemberRole = roles[roles.length - 1] ?? 'member';
    if (removed) {
      ordered.push(change('removed', roles.length + 1, last));
    }
    return fc
      .array(fc.constantFrom(...ordered), { maxLength: 8 })
      .chain((duplicates: MembershipChange[]) => {
        const pool: MembershipChange[] = [...ordered, ...duplicates];
        return fc.shuffledSubarray(pool, { minLength: pool.length, maxLength: pool.length });
      })
      .map((delivered: MembershipChange[]): DeliveredHistory => ({ ordered, delivered }));
  });

/**
 * Applies events to the copy their first one began.
 *
 * @param events - The events, at least one.
 * @returns The final membership.
 */
function replay(events: readonly MembershipChange[]): Membership {
  const [first, ...rest]: readonly MembershipChange[] = events;
  if (first === undefined) {
    throw new Error('A history has at least one event.');
  }
  return rest.reduce(
    (membership: Membership, next: MembershipChange): Membership => membership.apply(next),
    Membership.begin(first),
  );
}

describe('Membership: the final state does not depend on the order of delivery', () => {
  test.prop([historyArbitrary])(
    'converges to the state of the events applied in version order, whatever the order and the duplicates',
    ({ ordered, delivered }: DeliveredHistory) => {
      const expected: Membership = replay(ordered);
      const actual: Membership = replay(delivered);

      expect(actual.snapshot.role).toBe(expected.snapshot.role);
      expect(actual.snapshot.version).toBe(expected.snapshot.version);
      expect(actual.snapshot.removedAt).toEqual(expected.snapshot.removedAt);
      expect(actual.isActive).toBe(expected.isActive);
    },
  );

  test.prop([historyArbitrary])(
    'ends on the role and the version of the last event of the history',
    ({ ordered, delivered }: DeliveredHistory) => {
      const last: MembershipChange | undefined = ordered[ordered.length - 1];
      const actual: Membership = replay(delivered);

      expect(actual.snapshot.role).toBe(last?.role);
      expect(actual.snapshot.version).toBe(last?.version);
      expect(actual.isActive).toBe(last?.kind !== 'removed');
    },
  );
});
