import { describe, expect, it } from 'vitest';

import { InvalidSpaceError } from '../../../../../domain/errors/space/invalid-space.error.js';
import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  STRANGER,
  UNKNOWN_SPACE,
  atelierNordMembers,
  designState,
  refusalOf,
  spaceState,
} from '../../../spaces.fixture.js';
import type { UpdateSpaceInput } from './update-space.input.js';
import { UpdateSpace } from './update-space.use-case.js';

/**
 * Builds a change of the space "Produit" by Hugo Dubois, a member who sees it.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function updateProduit(overrides: Partial<UpdateSpaceInput> = {}): UpdateSpaceInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: HUGO,
    spaceId: PRODUIT,
    expectedVersions: null,
    patch: { name: 'Plateforme' },
    ...overrides,
  };
}

/** Atelier Nord with "Produit" (CAD, version 3, owned by Camille Martin) and the private "Design" (DES, Hugo Dubois). */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState({ version: 3 }), designState()],
    lastNumbers: { CAD: 481 },
  });
}

describe('UpdateSpace: a member who sees the space changes it', () => {
  it('stores the change at the next version and returns the space with its next key', async () => {
    const spaces = atelierNord();

    const view = await new UpdateSpace(spaces, atelierNordMembers()).execute(updateProduit());

    expect(view.space).toEqual(spaceState({ name: 'Plateforme', version: 4 }));
    expect(view.nextKey).toBe('CAD-482');
    expect(spaces.spaces.get(PRODUIT)).toEqual(view.space);
  });

  it('appends space.updated with what changed, by the caller', async () => {
    const spaces = atelierNord();

    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ patch: { name: 'Plateforme', color: 'vert' } }),
    );

    expect(spaces.events).toEqual([
      {
        kind: 'spaceUpdated',
        spaceId: PRODUIT,
        version: 4,
        changed: ['name', 'color'],
        actor: { type: 'user', id: HUGO },
      },
    ]);
  });

  it('applies the patch as a merge patch: what it leaves out is unchanged', async () => {
    const spaces = atelierNord();

    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ patch: { statuses: { progress: { name: 'En cours' } } } }),
    );

    expect(spaces.spaces.get(PRODUIT)).toMatchObject({
      name: 'Produit',
      prefix: 'CAD',
      icon: 'rocket',
      color: 'violet',
      version: 4,
    });
  });

  it('puts back every default status with statuses: null', async () => {
    const spaces = atelierNord();
    const update = new UpdateSpace(spaces, atelierNordMembers());
    await update.execute(
      updateProduit({ patch: { statuses: { progress: { name: 'En cours' } } } }),
    );

    await update.execute(updateProduit({ patch: { statuses: null } }));

    expect(spaces.spaces.get(PRODUIT)?.statuses.progress).toEqual({ name: null, hidden: false });
    expect(spaces.events.map((event) => event.kind)).toEqual(['spaceUpdated', 'spaceUpdated']);
  });
});

describe('UpdateSpace: a change that changes nothing stores nothing and emits nothing', () => {
  it('keeps the version and appends no event for an empty patch', async () => {
    const spaces = atelierNord();

    const view = await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ patch: {} }),
    );

    expect(view.space).toEqual(spaceState({ version: 3 }));
    expect(view.nextKey).toBe('CAD-482');
    expect(spaces.events).toEqual([]);
  });

  it('keeps the version and appends no event when the patch sets the values the space has', async () => {
    const spaces = atelierNord();

    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ patch: { name: ' Produit ', color: 'violet', visibility: 'organization' } }),
    );

    expect(spaces.spaces.get(PRODUIT)?.version).toBe(3);
    expect(spaces.events).toEqual([]);
  });

  it('is repeatable: sending the same patch again appends one event only', async () => {
    const spaces = atelierNord();
    const update = new UpdateSpace(spaces, atelierNordMembers());

    await update.execute(updateProduit());
    await update.execute(updateProduit());

    expect(spaces.spaces.get(PRODUIT)?.version).toBe(4);
    expect(spaces.events).toHaveLength(1);
  });
});

describe('UpdateSpace: the version sent in If-Match is the stored version', () => {
  it('refuses a version that is not the stored one, answering the stored version', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new UpdateSpace(spaces, atelierNordMembers()).execute(
        updateProduit({ expectedVersions: [2] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 3 });
    expect(spaces.spaces.get(PRODUIT)?.name).toBe('Produit');
    expect(spaces.events).toEqual([]);
  });

  it('applies the change when the stored version is the one sent', async () => {
    const spaces = atelierNord();

    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ expectedVersions: [3] }),
    );

    expect(spaces.spaces.get(PRODUIT)?.version).toBe(4);
  });

  it('applies the change when the stored version is one of the versions sent', async () => {
    const spaces = atelierNord();

    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ expectedVersions: [1, 3] }),
    );

    expect(spaces.spaces.get(PRODUIT)?.version).toBe(4);
  });

  it('applies the change when no version is sent', async () => {
    const spaces = atelierNord();

    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ expectedVersions: null }),
    );

    expect(spaces.spaces.get(PRODUIT)?.version).toBe(4);
  });

  it('refuses a stale version even when the patch would change nothing', async () => {
    const refusal = await refusalOf(
      new UpdateSpace(atelierNord(), atelierNordMembers()).execute(
        updateProduit({ patch: {}, expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 3 });
  });
});

describe('UpdateSpace: a prefix belongs for good to the space that used it', () => {
  it('refuses the prefix of another space, naming it, and stores and appends nothing', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new UpdateSpace(spaces, atelierNordMembers()).execute(
        updateProduit({ patch: { name: 'Plateforme', prefix: 'DES' } }),
      ),
    );

    expect(refusal).toEqual({ reason: 'prefix-taken', prefix: 'DES' });
    expect(spaces.spaces.get(PRODUIT)).toEqual(spaceState({ version: 3 }));
    expect(spaces.events).toEqual([]);
  });

  it('refuses a former prefix of another space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ version: 3 }), designState()],
      formerPrefixes: [{ prefix: 'UX', spaceId: DESIGN }],
    });

    const refusal = await refusalOf(
      new UpdateSpace(spaces, atelierNordMembers()).execute(
        updateProduit({ patch: { prefix: 'UX' } }),
      ),
    );

    expect(refusal).toEqual({ reason: 'prefix-taken', prefix: 'UX' });
    expect(spaces.events).toEqual([]);
  });

  it('lets the space take back one of its own former prefixes and continue its numbering', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ prefix: 'PRD', version: 3 })],
      formerPrefixes: [{ prefix: 'CAD', spaceId: PRODUIT }],
      lastNumbers: { CAD: 481 },
    });

    const view = await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ patch: { prefix: 'CAD' } }),
    );

    expect(view.space).toMatchObject({ prefix: 'CAD', version: 4 });
    expect(view.nextKey).toBe('CAD-482');
    expect(spaces.events).toMatchObject([{ kind: 'spaceUpdated', changed: ['prefix'] }]);
  });

  it('claims a free prefix and keeps the former one for the space', async () => {
    const spaces = atelierNord();
    const update = new UpdateSpace(spaces, atelierNordMembers());

    const view = await update.execute(updateProduit({ patch: { prefix: 'PRD' } }));

    expect(view.space.prefix).toBe('PRD');
    expect(view.nextKey).toBe('PRD-1');
    expect(spaces.prefixOwners.get(`${ATELIER_NORD}/CAD`)).toBe(PRODUIT);
    expect(spaces.prefixOwners.get(`${ATELIER_NORD}/PRD`)).toBe(PRODUIT);
  });

  it('does not let another space take the former prefix of a renamed one', async () => {
    const spaces = atelierNord();
    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ patch: { prefix: 'PRD' } }),
    );

    const refusal = await refusalOf(
      new UpdateSpace(spaces, atelierNordMembers()).execute(
        updateProduit({ spaceId: DESIGN, actorUserId: HUGO, patch: { prefix: 'CAD' } }),
      ),
    );

    expect(refusal).toEqual({ reason: 'prefix-taken', prefix: 'CAD' });
  });

  it('does not claim a prefix when the patch leaves it out', async () => {
    const spaces = atelierNord();
    const before = spaces.prefixOwners.size;

    await new UpdateSpace(spaces, atelierNordMembers()).execute(updateProduit());

    expect(spaces.prefixOwners.size).toBe(before);
  });
});

describe('UpdateSpace: only the owner of the space, or the owner or an admin of the organization, changes its visibility', () => {
  it('refuses a member who does not own the space, and applies none of the patch', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new UpdateSpace(spaces, atelierNordMembers()).execute(
        updateProduit({
          actorUserId: LEA,
          patch: { name: 'Plateforme', visibility: 'private' },
        }),
      ),
    );

    expect(refusal).toEqual({ reason: 'visibility-forbidden' });
    expect(spaces.spaces.get(PRODUIT)).toEqual(spaceState({ version: 3 }));
    expect(spaces.events).toEqual([]);
  });

  it('lets a member who does not own the space change everything else', async () => {
    const spaces = atelierNord();

    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ actorUserId: LEA, patch: { name: 'Plateforme', color: 'vert' } }),
    );

    expect(spaces.spaces.get(PRODUIT)).toMatchObject({ name: 'Plateforme', color: 'vert' });
  });

  it('lets the owner of the space change its visibility', async () => {
    const spaces = atelierNord();

    const view = await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ spaceId: DESIGN, patch: { visibility: 'organization' } }),
    );

    expect(view.space.visibility).toBe('organization');
    expect(spaces.events).toMatchObject([{ kind: 'spaceUpdated', changed: ['visibility'] }]);
  });

  it('lets an admin make a space private and gives her the answer, though she no longer sees it', async () => {
    const spaces = atelierNord();
    const update = new UpdateSpace(spaces, atelierNordMembers());

    const view = await update.execute(
      updateProduit({ actorUserId: INES, patch: { visibility: 'private' } }),
    );

    expect(view.space).toMatchObject({ visibility: 'private', ownerUserId: CAMILLE, version: 4 });
    expect(view.nextKey).toBe('CAD-482');
    expect(spaces.events).toMatchObject([
      { kind: 'spaceUpdated', changed: ['visibility'], actor: { type: 'user', id: INES } },
    ]);
    expect(await refusalOf(update.execute(updateProduit({ actorUserId: INES })))).toEqual({
      reason: 'space-not-found',
    });
  });

  it('lets the owner of the organization make a space of a member private', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState({ ownerUserId: HUGO })] });

    const view = await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ actorUserId: CAMILLE, patch: { visibility: 'private' } }),
    );

    expect(view.space.visibility).toBe('private');
  });
});

describe('UpdateSpace: todo and done are always used', () => {
  it.each(['todo', 'done'] as const)('refuses to hide %s and names it', async (status) => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new UpdateSpace(spaces, atelierNordMembers()).execute(
        updateProduit({ patch: { statuses: { [status]: { hidden: true } } } }),
      ),
    );

    expect(refusal).toEqual({ reason: 'status-required', status });
    expect(spaces.spaces.get(PRODUIT)).toEqual(spaceState({ version: 3 }));
    expect(spaces.events).toEqual([]);
  });

  it('hides another status', async () => {
    const spaces = atelierNord();

    await new UpdateSpace(spaces, atelierNordMembers()).execute(
      updateProduit({ patch: { statuses: { blocked: { hidden: true } } } }),
    );

    expect(spaces.spaces.get(PRODUIT)?.statuses.blocked).toEqual({ name: null, hidden: true });
  });

  it('rejects a status name of 25 characters as an invalid space, not as a refusal', async () => {
    await expect(
      new UpdateSpace(atelierNord(), atelierNordMembers()).execute(
        updateProduit({ patch: { statuses: { review: { name: 'a'.repeat(25) } } } }),
      ),
    ).rejects.toThrow(InvalidSpaceError);
  });
});

describe('UpdateSpace: a space the caller does not see is unknown', () => {
  it('answers space-not-found to the owner of the organization for a private space of a member', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new UpdateSpace(spaces, atelierNordMembers()).execute(
        updateProduit({ spaceId: DESIGN, actorUserId: CAMILLE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
    expect(spaces.events).toEqual([]);
  });

  it('answers space-not-found to an admin and to another member for a private space', async () => {
    for (const actorUserId of [INES, LEA]) {
      const refusal = await refusalOf(
        new UpdateSpace(atelierNord(), atelierNordMembers()).execute(
          updateProduit({ spaceId: DESIGN, actorUserId }),
        ),
      );

      expect(refusal).toEqual({ reason: 'space-not-found' });
    }
  });

  it('answers space-not-found to a guest, even for an organization space', async () => {
    const refusal = await refusalOf(
      new UpdateSpace(atelierNord(), atelierNordMembers()).execute(
        updateProduit({ actorUserId: NADIA }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers space-not-found for a space that does not exist', async () => {
    const refusal = await refusalOf(
      new UpdateSpace(atelierNord(), atelierNordMembers()).execute(
        updateProduit({ spaceId: UNKNOWN_SPACE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers space-not-found for a space of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
    });

    const refusal = await refusalOf(
      new UpdateSpace(spaces, atelierNordMembers()).execute(updateProduit()),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new UpdateSpace(atelierNord(), atelierNordMembers()).execute(
        updateProduit({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('UpdateSpace: a space made private is never left to an owner who is no longer a member', () => {
  /** "Produit" at version 3, owned by Hugo Dubois, who has since left the organization. */
  function ownedByALeaver(): InMemorySpaces {
    return new InMemorySpaces({ spaces: [spaceState({ ownerUserId: HUGO, version: 3 })] });
  }

  it('hands the space to the owner of the organization in the same change, at one next version', async () => {
    const spaces = ownedByALeaver();
    const members = atelierNordMembers({ removed: [HUGO] });

    const view = await new UpdateSpace(spaces, members).execute(
      updateProduit({ actorUserId: INES, patch: { visibility: 'private' } }),
    );

    expect(view.space).toMatchObject({ visibility: 'private', ownerUserId: CAMILLE, version: 4 });
    expect(spaces.spaces.get(PRODUIT)).toEqual(view.space);
  });

  it('appends one space.updated naming the visibility and the owner', async () => {
    const spaces = ownedByALeaver();

    await new UpdateSpace(spaces, atelierNordMembers({ removed: [HUGO] })).execute(
      updateProduit({ actorUserId: INES, patch: { name: 'Plateforme', visibility: 'private' } }),
    );

    expect(spaces.events).toEqual([
      {
        kind: 'spaceUpdated',
        spaceId: PRODUIT,
        version: 4,
        changed: ['name', 'visibility', 'ownerUserId'],
        actor: { type: 'user', id: INES },
      },
    ]);
  });

  it('refuses with visibility-forbidden when the owner of the organization is unknown, changing nothing', async () => {
    const spaces = ownedByALeaver();
    const members = atelierNordMembers({ removed: [HUGO], ownerKnown: false });

    const refusal = await refusalOf(
      new UpdateSpace(spaces, members).execute(
        updateProduit({ actorUserId: INES, patch: { name: 'Plateforme', visibility: 'private' } }),
      ),
    );

    expect(refusal).toEqual({ reason: 'visibility-forbidden' });
    expect(spaces.spaces.get(PRODUIT)).toEqual(spaceState({ ownerUserId: HUGO, version: 3 }));
    expect(spaces.events).toEqual([]);
  });

  it('keeps the owner and asks nobody when the owner is still a member', async () => {
    const spaces = ownedByALeaver();
    const members = atelierNordMembers();

    const view = await new UpdateSpace(spaces, members).execute(
      updateProduit({ actorUserId: INES, patch: { visibility: 'private' } }),
    );

    expect(view.space).toMatchObject({ ownerUserId: HUGO, version: 4 });
    expect(spaces.events).toMatchObject([{ changed: ['visibility'] }]);
    expect(members.ownerCalls).toEqual([]);
  });

  it('looks at nobody when the change makes the space visible to the organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ ownerUserId: INES, visibility: 'private', version: 3 })],
    });
    const members = atelierNordMembers({ removed: [HUGO] });

    const view = await new UpdateSpace(spaces, members).execute(
      updateProduit({ actorUserId: INES, patch: { visibility: 'organization' } }),
    );

    expect(view.space).toMatchObject({ visibility: 'organization', ownerUserId: INES });
    expect(members.ownerCalls).toEqual([]);
    expect(members.roleCalls.map((call) => call.userId)).toEqual([INES]);
  });

  it('looks at the owner only when the patch changes the visibility', async () => {
    const spaces = ownedByALeaver();
    const members = atelierNordMembers({ removed: [HUGO] });

    const view = await new UpdateSpace(spaces, members).execute(
      updateProduit({ actorUserId: INES, patch: { name: 'Plateforme' } }),
    );

    expect(view.space.ownerUserId).toBe(HUGO);
    expect(members.ownerCalls).toEqual([]);
  });

  it('looks at nobody else when the space is already private and the patch repeats it', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ ownerUserId: INES, visibility: 'private', version: 3 })],
    });
    const members = atelierNordMembers();

    await new UpdateSpace(spaces, members).execute(
      updateProduit({ actorUserId: INES, patch: { visibility: 'private' } }),
    );

    expect(spaces.events).toEqual([]);
    expect(members.roleCalls.map((call) => call.userId)).toEqual([INES]);
  });
});

describe('UpdateSpace: the membership of the caller is locked, so a removal cannot slip in', () => {
  it('asks the directory for the role of the caller with the lock', async () => {
    const members = atelierNordMembers();

    await new UpdateSpace(atelierNord(), members).execute(updateProduit());

    expect(members.roleCalls[0]).toEqual({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      lock: true,
    });
  });
});
