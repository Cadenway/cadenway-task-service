import { describe, expect, it } from 'vitest';

import type { RequesterStanding } from '../../value-objects/access-request/requester-standing.value-object.js';
import { isRequestStored } from './access-request-storage.policy.js';

/**
 * A member with no role on a space of the organization.
 *
 * @param overrides - Members to replace.
 * @returns The standing.
 */
function standing(overrides: Partial<RequesterStanding> = {}): RequesterStanding {
  return {
    target: 'space',
    targetFound: true,
    requesterRole: 'member',
    roleOnTarget: null,
    ...overrides,
  };
}

describe('isRequestStored: only a target of the organization the requester has no role on', () => {
  it('stores the request of a member for a space they have no role on', () => {
    expect(isRequestStored(standing())).toBe(true);
  });

  it('stores the request for a list or a task whose list they have no role on', () => {
    expect(isRequestStored(standing({ target: 'list' }))).toBe(true);
    expect(isRequestStored(standing({ target: 'task' }))).toBe(true);
  });

  it('does not store the request for a target the organization does not hold', () => {
    expect(isRequestStored(standing({ targetFound: false }))).toBe(false);
    expect(isRequestStored(standing({ target: 'task', targetFound: false }))).toBe(false);
  });

  it('does not store the request when the requester already has a role, whatever it is', () => {
    for (const role of ['edit', 'comment', 'view'] as const) {
      expect(isRequestStored(standing({ roleOnTarget: role }))).toBe(false);
      expect(isRequestStored(standing({ target: 'list', roleOnTarget: role }))).toBe(false);
      expect(isRequestStored(standing({ target: 'task', roleOnTarget: role }))).toBe(false);
    }
  });
});

describe('isRequestStored: a guest holds grants of lists only', () => {
  it('never stores the request of a guest for a space', () => {
    expect(isRequestStored(standing({ requesterRole: 'guest' }))).toBe(false);
  });

  it('stores the request of a guest for a list or a task they have no role on', () => {
    expect(isRequestStored(standing({ requesterRole: 'guest', target: 'list' }))).toBe(true);
    expect(isRequestStored(standing({ requesterRole: 'guest', target: 'task' }))).toBe(true);
  });

  it('stores the request of the owner or an admin of the organization for a private space', () => {
    expect(isRequestStored(standing({ requesterRole: 'owner' }))).toBe(true);
    expect(isRequestStored(standing({ requesterRole: 'admin' }))).toBe(true);
  });
});
