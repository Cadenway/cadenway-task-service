import { describe, expect, it } from 'vitest';

import { AssigneeInvalidError } from '../../errors/task/assignee-invalid.error.js';
import { CAMILLE, HUGO, INES, NADIA, STRANGER, candidate } from '../../tasks.fixture.js';
import type { MemberRole } from '../../value-objects/member/member-role.value-object.js';
import { isAssignable, refuseUnassignable } from './assignability.policy.js';

describe('isAssignable: a current member other than a guest', () => {
  it.each(['owner', 'admin', 'member'] as const)('accepts the role %s', (role: MemberRole) => {
    expect(isAssignable(role)).toBe(true);
  });

  it('refuses a guest and an account the copy does not hold', () => {
    expect(isAssignable('guest')).toBe(false);
    expect(isAssignable(null)).toBe(false);
  });

  it('refuses a role it does not know', () => {
    expect(isAssignable('viewer' as MemberRole)).toBe(false);
  });
});

describe('refuseUnassignable: a creation names every invalid account at once', () => {
  it('accepts members', () => {
    expect(() => {
      refuseUnassignable([candidate(CAMILLE, 'owner'), candidate(INES, 'admin')]);
    }).not.toThrow();
  });

  it('lists every refused account once, in the order sent', () => {
    let error: unknown;
    try {
      refuseUnassignable([
        candidate(STRANGER, null),
        candidate(HUGO, 'member'),
        candidate(NADIA, 'guest'),
        candidate(STRANGER, null),
      ]);
    } catch (caught: unknown) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AssigneeInvalidError);
    expect((error as AssigneeInvalidError).userIds).toEqual([STRANGER, NADIA]);
  });
});
