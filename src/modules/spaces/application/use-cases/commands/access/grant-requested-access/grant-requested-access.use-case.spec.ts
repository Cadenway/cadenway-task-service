import { describe, expect, it } from 'vitest';

import { GRANT_LIMIT } from '../../../../../domain/aggregates/access/resource-grants.aggregate.js';
import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  InMemorySpaces,
  LEA,
  NADIA,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  UNKNOWN_SPACE,
  atelierNordMembers,
  designState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { GrantRequestedAccessInput } from './grant-requested-access.input.js';
import { GrantRequestedAccess } from './grant-requested-access.use-case.js';

/**
 * Builds Hugo Dubois approving the request of Léa Petit to edit his private space Design.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function approve(overrides: Partial<GrantRequestedAccessInput> = {}): GrantRequestedAccessInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: HUGO,
    target: { kind: 'space', spaceId: DESIGN },
    granteeUserId: LEA,
    role: 'edit',
    ...overrides,
  };
}

/** Atelier Nord: the private Design (version 3) and Sprint 14 (version 2) of Produit. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState({ version: 3 })],
    lists: [sprintState({ version: 2 })],
  });
}

describe('GrantRequestedAccess: an approval creates or raises the grant', () => {
  it('creates the grant of the space at its next version, with space.access-changed by the approver', async () => {
    const spaces = atelierNord();

    const outcome = await new GrantRequestedAccess(spaces, atelierNordMembers()).execute(approve());

    expect(outcome).toEqual({ outcome: 'granted', changed: true });
    expect(spaces.spaces.get(DESIGN)?.version).toBe(4);
    expect(spaces.events).toEqual([
      {
        kind: 'spaceAccessChanged',
        spaceId: DESIGN,
        version: 4,
        grants: [{ userId: LEA, role: 'edit' }],
        changedUserIds: [LEA],
        actor: { type: 'user', id: HUGO },
      },
    ]);
  });

  it('raises a lower role', async () => {
    const spaces = atelierNord();
    spaces.grants = [spaceGrantOf(DESIGN, LEA, 'view')];

    const outcome = await new GrantRequestedAccess(spaces, atelierNordMembers()).execute(
      approve({ role: 'comment' }),
    );

    expect(outcome).toEqual({ outcome: 'granted', changed: true });
    expect(spaces.grantsOf({ kind: 'space', spaceId: DESIGN })).toEqual([
      { userId: LEA, role: 'comment' },
    ]);
  });

  it('keeps an equal or higher role, at the same version, with no event', async () => {
    const spaces = atelierNord();
    spaces.grants = [spaceGrantOf(DESIGN, LEA, 'edit')];

    const outcome = await new GrantRequestedAccess(spaces, atelierNordMembers()).execute(
      approve({ role: 'view' }),
    );

    expect(outcome).toEqual({ outcome: 'granted', changed: false });
    expect(spaces.grantsOf({ kind: 'space', spaceId: DESIGN })).toEqual([
      { userId: LEA, role: 'edit' },
    ]);
    expect(spaces.spaces.get(DESIGN)?.version).toBe(3);
    expect(spaces.events).toEqual([]);
  });

  it('gives a guest the grant of a list at its next version, with list.access-changed', async () => {
    const spaces = atelierNord();

    const outcome = await new GrantRequestedAccess(spaces, atelierNordMembers()).execute(
      approve({
        actorUserId: CAMILLE,
        target: { kind: 'list', listId: SPRINT_14 },
        granteeUserId: NADIA,
        role: 'comment',
      }),
    );

    expect(outcome).toEqual({ outcome: 'granted', changed: true });
    expect(spaces.events).toEqual([
      {
        kind: 'listAccessChanged',
        listId: SPRINT_14,
        spaceId: PRODUIT,
        version: 3,
        organizationAccess: true,
        grants: [{ userId: NADIA, role: 'comment' }],
        changed: ['grants'],
        changedUserIds: [NADIA],
        actor: { type: 'user', id: CAMILLE },
      },
    ]);
  });

  it('locks the membership of the requester, then the space, or the space for share then the list', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;
    const grant = new GrantRequestedAccess(spaces, members);

    await grant.execute(approve());
    await grant.execute(
      approve({ target: { kind: 'list', listId: SPRINT_14 }, granteeUserId: NADIA }),
    );

    expect(spaces.journal).toEqual([
      `membership ${LEA}`,
      `space ${DESIGN}`,
      `membership ${NADIA}`,
      `space ${PRODUIT} share`,
      `list ${SPRINT_14}`,
    ]);
  });
});

describe('GrantRequestedAccess: a rule that refuses the grant answers refused, writing nothing', () => {
  it.each([
    [
      'a space that no longer exists',
      approve({ target: { kind: 'space', spaceId: UNKNOWN_SPACE } }),
      'not-found',
    ],
    [
      'a list that no longer exists',
      approve({ target: { kind: 'list', listId: UNKNOWN_LIST } }),
      'not-found',
    ],
    [
      'a requester who left the organization',
      approve({ granteeUserId: STRANGER }),
      'grantee-invalid',
    ],
    ['a guest asking for a space', approve({ granteeUserId: NADIA }), 'guest-space-forbidden'],
    ['the owner of the space', approve({ granteeUserId: HUGO }), 'owner-unchangeable'],
  ] as const)('refuses %s', async (_case, input, reason) => {
    const spaces = atelierNord();

    const outcome = await new GrantRequestedAccess(spaces, atelierNordMembers()).execute(input);

    expect(outcome).toEqual({ outcome: 'refused', reason });
    expect(spaces.grants).toEqual([]);
    expect(spaces.events).toEqual([]);
  });

  it('refuses grant-limit-reached for a new grant on a list that holds 200', async () => {
    const spaces = atelierNord();
    spaces.grants = Array.from({ length: GRANT_LIMIT }, (_unused: unknown, index: number) =>
      listGrantOf(
        PRODUIT,
        SPRINT_14,
        `019a6f00-0000-7000-8000-${String(index).padStart(12, '0')}`,
        'view',
      ),
    );

    const outcome = await new GrantRequestedAccess(spaces, atelierNordMembers()).execute(
      approve({ target: { kind: 'list', listId: SPRINT_14 } }),
    );

    expect(outcome).toEqual({ outcome: 'refused', reason: 'grant-limit-reached' });
  });
});
