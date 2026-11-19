import { describe, expect, it } from 'vitest';

import { GRANT_LIMIT } from '../../../../../domain/aggregates/access/resource-grants.aggregate.js';
import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  GRANTED_AT,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  NADIA,
  PRODUIT,
  STRANGER,
  UNKNOWN_SPACE,
  atelierNordMembers,
  designState,
  refusalOf,
  spaceGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import type { SetSpaceGrantInput } from './set-space-grant.input.js';
import { SetSpaceGrant } from './set-space-grant.use-case.js';

/**
 * Builds Camille Martin, owner of Produit, giving Léa Petit `edit` on it.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function share(overrides: Partial<SetSpaceGrantInput> = {}): SetSpaceGrantInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    spaceId: PRODUIT,
    userId: LEA,
    role: 'edit',
    expectedVersions: null,
    ...overrides,
  };
}

/** Atelier Nord: Produit (version 5, Camille Martin) shared with Inès Robert, and the private Design of Hugo Dubois. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState({ version: 5 }), designState()],
    grants: [spaceGrantOf(PRODUIT, INES, 'view')],
  });
}

describe('SetSpaceGrant: who manages a space gives a person a role on it', () => {
  it('stores the grant, takes the next version of the space and answers the grant', async () => {
    const spaces = atelierNord();

    const set = await new SetSpaceGrant(spaces, atelierNordMembers()).execute(share());

    expect(set.version).toBe(6);
    expect(set.grant).toMatchObject({
      userId: LEA,
      role: 'edit',
      grantedBy: { type: 'user', id: CAMILLE },
    });
    expect(spaces.spaces.get(PRODUIT)?.version).toBe(6);
    expect(spaces.grantsOf({ kind: 'space', spaceId: PRODUIT })).toEqual([
      { userId: INES, role: 'view' },
      { userId: LEA, role: 'edit' },
    ]);
  });

  it('appends space.access-changed with every grant after it and the person changed', async () => {
    const spaces = atelierNord();

    await new SetSpaceGrant(spaces, atelierNordMembers()).execute(share());

    expect(spaces.events).toEqual([
      {
        kind: 'spaceAccessChanged',
        spaceId: PRODUIT,
        version: 6,
        grants: [
          { userId: INES, role: 'view' },
          { userId: LEA, role: 'edit' },
        ],
        changedUserIds: [LEA],
        actor: { type: 'user', id: CAMILLE },
      },
    ]);
  });

  it('changes a role in place: the first grant instant stays, the instant and the actor of the role change', async () => {
    const spaces = atelierNord();

    const set = await new SetSpaceGrant(spaces, atelierNordMembers()).execute(
      share({ actorUserId: INES, userId: INES, role: 'comment', expectedVersions: [5] }),
    );

    expect(set.grant.createdAt).toEqual(GRANTED_AT);
    expect(set.grant.grantedAt).not.toEqual(GRANTED_AT);
    expect(set.grant.grantedBy).toEqual({ type: 'user', id: INES });
    expect(spaces.grantsOf({ kind: 'space', spaceId: PRODUIT })).toEqual([
      { userId: INES, role: 'comment' },
    ]);
  });

  it('answers the same role again with the stored grant and version, writing and emitting nothing', async () => {
    const spaces = atelierNord();

    const set = await new SetSpaceGrant(spaces, atelierNordMembers()).execute(
      share({ userId: INES, role: 'view' }),
    );

    expect(set).toEqual({
      grant: {
        userId: INES,
        role: 'view',
        createdAt: GRANTED_AT,
        grantedAt: GRANTED_AT,
        grantedBy: { type: 'user', id: CAMILLE },
      },
      version: 5,
    });
    expect(spaces.events).toEqual([]);
  });

  it('lets an admin of the organization share a space of the organization', async () => {
    const set = await new SetSpaceGrant(atelierNord(), atelierNordMembers()).execute(
      share({ actorUserId: INES }),
    );

    expect(set.version).toBe(6);
  });

  it('locks the membership of the actor, then the one of the person, then the space', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    await new SetSpaceGrant(spaces, members).execute(share());

    expect(spaces.journal).toEqual([
      `membership ${CAMILLE}`,
      `membership ${LEA}`,
      `space ${PRODUIT}`,
    ]);
  });
});

describe('SetSpaceGrant: the refusals come in the order of the contract', () => {
  it('answers space-not-found for a space that does not exist', async () => {
    const refusal = await refusalOf(
      new SetSpaceGrant(atelierNord(), atelierNordMembers()).execute(
        share({ spaceId: UNKNOWN_SPACE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers space-not-found, not manage-forbidden, for a private space the actor does not see', async () => {
    const refusal = await refusalOf(
      new SetSpaceGrant(atelierNord(), atelierNordMembers()).execute(share({ spaceId: DESIGN })),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('refuses manage-forbidden to a member who sees the space without managing it, before If-Match', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new SetSpaceGrant(spaces, atelierNordMembers()).execute(
        share({ actorUserId: HUGO, expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'manage-forbidden' });
    expect(spaces.events).toEqual([]);
  });

  it('refuses manage-forbidden to a member with edit through a grant of a private space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      grants: [spaceGrantOf(DESIGN, LEA, 'edit')],
    });

    const refusal = await refusalOf(
      new SetSpaceGrant(spaces, atelierNordMembers()).execute(
        share({ actorUserId: LEA, spaceId: DESIGN, userId: INES }),
      ),
    );

    expect(refusal).toEqual({ reason: 'manage-forbidden' });
  });

  it('refuses a stale If-Match with the version of the space, before the rules of the grant', async () => {
    const refusal = await refusalOf(
      new SetSpaceGrant(atelierNord(), atelierNordMembers()).execute(
        share({ userId: STRANGER, expectedVersions: [4] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 5 });
  });

  it('refuses grantee-invalid, naming the account, for someone the copy does not hold', async () => {
    const refusal = await refusalOf(
      new SetSpaceGrant(atelierNord(), atelierNordMembers()).execute(share({ userId: STRANGER })),
    );

    expect(refusal).toEqual({ reason: 'grantee-invalid', userId: STRANGER });
  });

  it('refuses guest-space-forbidden for a guest of the organization', async () => {
    const refusal = await refusalOf(
      new SetSpaceGrant(atelierNord(), atelierNordMembers()).execute(share({ userId: NADIA })),
    );

    expect(refusal).toEqual({ reason: 'guest-space-forbidden' });
  });

  it('refuses owner-unchangeable for the owner of the space', async () => {
    const refusal = await refusalOf(
      new SetSpaceGrant(atelierNord(), atelierNordMembers()).execute(
        share({ actorUserId: INES, userId: CAMILLE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'owner-unchangeable' });
  });

  it('refuses grant-limit-reached for a new person on a space that holds 200, and still changes a role there', async () => {
    const others = Array.from({ length: GRANT_LIMIT - 1 }, (_unused: unknown, index: number) =>
      spaceGrantOf(PRODUIT, `019a6f00-0000-7000-8000-${String(index).padStart(12, '0')}`, 'view'),
    );
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      grants: [spaceGrantOf(PRODUIT, LEA, 'view'), ...others],
    });
    const setGrant = new SetSpaceGrant(spaces, atelierNordMembers());

    expect(await refusalOf(setGrant.execute(share({ userId: HUGO })))).toEqual({
      reason: 'grant-limit-reached',
    });
    expect((await setGrant.execute(share({ userId: LEA, role: 'edit' }))).grant.role).toBe('edit');
    expect(spaces.grants).toHaveLength(GRANT_LIMIT);
  });

  it('answers organization-not-found to an actor the copy does not hold', async () => {
    const refusal = await refusalOf(
      new SetSpaceGrant(atelierNord(), atelierNordMembers()).execute(
        share({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});
