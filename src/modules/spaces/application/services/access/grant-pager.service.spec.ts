import { describe, expect, it } from 'vitest';

import type { StoredGrant } from '../../models/access/stored-grant.model.js';
import { CAMILLE, GRANTED_AT, HUGO, INES, LEA } from '../../use-cases/spaces.fixture.js';
import { GrantPager } from './grant-pager.service.js';

/**
 * Builds a grant first given at an instant.
 *
 * @param userId - The person.
 * @param createdAt - When they were first given access.
 * @returns The grant.
 */
function grant(userId: string, createdAt: Date): StoredGrant {
  return {
    userId,
    role: 'view',
    createdAt,
    grantedAt: createdAt,
    grantedBy: { type: 'user', id: CAMILLE },
  };
}

describe('GrantPager: pages of the grants of a space or a list, in the order they were first given', () => {
  const later: Date = new Date('2026-03-05T09:00:00Z');
  const grants: readonly StoredGrant[] = [
    grant(HUGO, GRANTED_AT),
    grant(LEA, GRANTED_AT),
    grant(INES, later),
  ];

  it('keeps the limit and the position of the last person, and counts every grant', () => {
    const page = new GrantPager().page(grants, null, 2);

    expect(page.items.map((item) => item.userId)).toEqual([HUGO, LEA]);
    expect(page.next).toEqual({ createdAt: GRANTED_AT, id: LEA });
    expect(page.total).toBe(3);
  });

  it('continues after a position, the account breaking a tie of the instant', () => {
    const page = new GrantPager().page(grants, { createdAt: GRANTED_AT, id: HUGO }, 2);

    expect(page.items.map((item) => item.userId)).toEqual([LEA, INES]);
    expect(page.next).toBeNull();
    expect(page.total).toBe(3);
  });

  it('answers an empty last page with the total', () => {
    expect(new GrantPager().page(grants, { createdAt: later, id: INES }, 2)).toEqual({
      items: [],
      next: null,
      total: 3,
    });
  });
});
