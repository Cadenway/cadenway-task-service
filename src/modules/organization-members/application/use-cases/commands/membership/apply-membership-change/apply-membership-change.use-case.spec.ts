import { beforeEach, describe, expect, it } from 'vitest';

import { MembershipMismatchError } from '../../../../../domain/errors/membership/membership-mismatch.error.js';
import {
  ATELIER_NORD,
  HUGO,
  HUGO_MEMBERSHIP,
  INES,
  InMemoryMemberships,
  OCCURRED_AT,
  membershipChange,
  membershipState,
} from '../../../memberships.fixture.js';
import { ApplyMembershipChange } from './apply-membership-change.use-case.js';

describe('ApplyMembershipChange: the copy follows the version of the membership', () => {
  let store: InMemoryMemberships;
  let apply: ApplyMembershipChange;

  beforeEach(() => {
    store = new InMemoryMemberships();
    apply = new ApplyMembershipChange(store);
  });

  it('inserts a membership seen for the first time, from its join', async () => {
    await apply.execute(membershipChange('joined', 1));

    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(membershipState());
    expect(store.inserts).toHaveLength(1);
    expect(store.updates).toHaveLength(0);
  });

  it('inserts a removed copy when the removal is the first event seen', async () => {
    await apply.execute(membershipChange('removed', 3, { role: 'admin' }));

    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(
      membershipState({ role: 'admin', version: 3, removedAt: OCCURRED_AT }),
    );
  });

  it('updates the copy when the event carries a newer version', async () => {
    store = new InMemoryMemberships([membershipState()]);
    apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('role-changed', 2, { role: 'admin' }));

    expect(store.updates).toEqual([membershipState({ role: 'admin', version: 2 })]);
    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(membershipState({ role: 'admin', version: 2 }));
    expect(store.inserts).toHaveLength(0);
  });

  it('marks the copy removed when the removal arrives', async () => {
    store = new InMemoryMemberships([membershipState()]);
    apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('removed', 2));

    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(
      membershipState({ version: 2, removedAt: OCCURRED_AT }),
    );
  });

  it('writes nothing for an event of the version the copy already holds', async () => {
    const stored = membershipState({ role: 'admin', version: 2 });
    store = new InMemoryMemberships([stored]);
    apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('role-changed', 2, { role: 'guest' }));

    expect(store.updates).toHaveLength(0);
    expect(store.inserts).toHaveLength(0);
    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(stored);
  });

  it('writes nothing for an event older than the copy', async () => {
    const stored = membershipState({ role: 'admin', version: 3 });
    store = new InMemoryMemberships([stored]);
    apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('joined', 1));

    expect(store.updates).toHaveLength(0);
    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(stored);
  });

  it('writes nothing for a late event of a removed membership', async () => {
    const stored = membershipState({ version: 2, removedAt: OCCURRED_AT });
    store = new InMemoryMemberships([stored]);
    apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('role-changed', 5, { role: 'admin' }));

    expect(store.updates).toHaveLength(0);
    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(stored);
  });

  it('changes nothing for an event delivered twice', async () => {
    await apply.execute(membershipChange('joined', 1));
    await apply.execute(membershipChange('role-changed', 2, { role: 'admin' }));
    await apply.execute(membershipChange('role-changed', 2, { role: 'admin' }));

    expect(store.inserts).toHaveLength(1);
    expect(store.updates).toHaveLength(1);
    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(membershipState({ role: 'admin', version: 2 }));
  });

  it('locks the membership of the organization of the event before it writes', async () => {
    await apply.execute(membershipChange('joined', 1));

    expect(store.locks[0]).toEqual({ organizationId: ATELIER_NORD, id: HUGO_MEMBERSHIP });
  });
});

describe('ApplyMembershipChange: two events of a new membership handled at once', () => {
  it('re-locks and applies on the stored copy when a concurrent event inserted the row first', async () => {
    const store = new InMemoryMemberships();
    store.racingRow = membershipState();
    const apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('role-changed', 2, { role: 'admin' }));

    expect(store.locks).toHaveLength(2);
    expect(store.updates).toEqual([membershipState({ role: 'admin', version: 2 })]);
    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(membershipState({ role: 'admin', version: 2 }));
  });

  it('keeps the stored copy when the event that lost the race is older than it', async () => {
    const store = new InMemoryMemberships();
    store.racingRow = membershipState({ role: 'admin', version: 3 });
    const apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('joined', 1));

    expect(store.locks).toHaveLength(2);
    expect(store.updates).toHaveLength(0);
    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(membershipState({ role: 'admin', version: 3 }));
  });

  it('propagates the error when the row cannot be read back after a lost insert race', async () => {
    const store = new InMemoryMemberships();
    store.loseInsertWithoutRow = true;
    const apply = new ApplyMembershipChange(store);

    await expect(apply.execute(membershipChange('joined', 1))).rejects.toThrow(
      'The membership a concurrent event stored cannot be read back.',
    );

    expect(store.rows.size).toBe(0);
    expect(store.updates).toHaveLength(0);
  });
});

describe('ApplyMembershipChange: a membership never moves', () => {
  it('propagates the mismatch and writes nothing when the event names another account', async () => {
    const stored = membershipState();
    const store = new InMemoryMemberships([stored]);
    const apply = new ApplyMembershipChange(store);

    await expect(
      apply.execute(membershipChange('role-changed', 2, { userId: INES, role: 'admin' })),
    ).rejects.toThrow(MembershipMismatchError);

    expect(store.updates).toHaveLength(0);
    expect(store.inserts).toHaveLength(0);
    expect(store.rows.get(HUGO_MEMBERSHIP)).toEqual(stored);
  });

  it('applies the event of the account the copy holds, not another one of the organization', async () => {
    const store = new InMemoryMemberships([membershipState()]);
    const apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('role-changed', 2, { userId: HUGO, role: 'guest' }));

    expect(store.rows.get(HUGO_MEMBERSHIP)).toMatchObject({ userId: HUGO, role: 'guest' });
  });

  it('still ends the membership on a removal that names another account, keeping its own', async () => {
    const store = new InMemoryMemberships([membershipState()]);
    const apply = new ApplyMembershipChange(store);

    await apply.execute(membershipChange('removed', 2, { userId: INES }));

    expect(store.rows.get(HUGO_MEMBERSHIP)).toMatchObject({
      userId: HUGO,
      version: 2,
      removedAt: OCCURRED_AT,
    });
  });
});
