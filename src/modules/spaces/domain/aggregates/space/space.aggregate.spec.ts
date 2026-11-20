import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import { InvalidSpaceError } from '../../errors/space/invalid-space.error.js';
import { canSeeSpace } from '../../policies/access/access-role.policy.js';
import { SpaceStatusRequiredError } from '../../errors/space/space-status-required.error.js';
import { SpaceVisibilityForbiddenError } from '../../errors/space/space-visibility-forbidden.error.js';
import {
  ATELIER_NORD,
  CAMILLE,
  CAMILLE_VIEWER,
  DELETED_AT,
  HUGO,
  HUGO_VIEWER,
  INES_VIEWER,
  LEA_VIEWER,
  NADIA_VIEWER,
  RESTORED_FROM_TRASH_AT,
  designState,
  spaceState,
} from '../../spaces.fixture.js';
import type { ListActor } from '../../value-objects/list/list-actor.value-object.js';
import type { NewSpace } from '../../value-objects/space/new-space.value-object.js';
import type { SpaceDraft } from '../../value-objects/space/space-draft.value-object.js';
import type { SpaceState } from '../../value-objects/space/space-state.value-object.js';
import type { SpaceUpdate } from '../../value-objects/space/space-update.value-object.js';
import { DEFAULT_SPACE_STATUSES } from '../../value-objects/status/space-statuses.value-object.js';
import type { SpaceStatuses } from '../../value-objects/status/space-statuses.value-object.js';
import { STATUS_KEYS } from '../../value-objects/status/status-key.value-object.js';
import { Space } from './space.aggregate.js';

/** No grant on the space nor on any of its lists: the P3a rule alone. */
const NO_GRANTS = { space: null, anyList: false } as const;

/**
 * Builds the creation of the space "Produit" as Camille Martin types it.
 *
 * @param overrides - Fields to replace.
 * @returns The new space.
 */
function newSpace(overrides: Partial<NewSpace> = {}): NewSpace {
  return {
    organizationId: ATELIER_NORD,
    ownerUserId: CAMILLE,
    name: 'Produit',
    prefix: 'CAD',
    description: null,
    icon: 'rocket',
    color: 'violet',
    visibility: 'organization',
    ...overrides,
  };
}

/**
 * Restores the space "Produit", or another state.
 *
 * @param overrides - Fields to replace.
 * @returns The space.
 */
function produit(overrides: Partial<SpaceState> = {}): Space {
  return Space.restore(spaceState(overrides));
}

/**
 * Builds the statuses of a space whose statuses were changed.
 *
 * @param overrides - The statuses to replace, by key.
 * @returns The ten statuses.
 */
function statuses(overrides: Partial<SpaceStatuses>): SpaceStatuses {
  return { ...DEFAULT_SPACE_STATUSES, ...overrides };
}

/**
 * Runs a call that must throw and returns what it threw.
 *
 * @param call - The call.
 * @returns The thrown value.
 */
function thrownBy(call: () => unknown): unknown {
  try {
    call();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('The call was expected to throw.');
}

describe('Space.create: the name is trimmed and has 1 to 80 characters', () => {
  it('trims the name', () => {
    expect(Space.create(newSpace({ name: '  Produit  ' })).name).toBe('Produit');
  });

  it('refuses a name made only of spaces', () => {
    expect(() => Space.create(newSpace({ name: '   ' }))).toThrow(InvalidSpaceError);
  });

  it('refuses an empty name', () => {
    expect(() => Space.create(newSpace({ name: '' }))).toThrow(InvalidSpaceError);
  });

  it('accepts a name of 80 characters and refuses one of 81', () => {
    expect(Space.create(newSpace({ name: 'a'.repeat(80) })).name).toHaveLength(80);
    expect(() => Space.create(newSpace({ name: 'a'.repeat(81) }))).toThrow(InvalidSpaceError);
  });

  it('counts the characters of the name once trimmed, not the spaces around it', () => {
    expect(Space.create(newSpace({ name: ` ${'a'.repeat(80)} ` })).name).toHaveLength(80);
  });

  it('counts an emoji as one character, as the contract does', () => {
    expect(Space.create(newSpace({ name: '🚀'.repeat(80) })).name).toBe('🚀'.repeat(80));
    expect(() => Space.create(newSpace({ name: '🚀'.repeat(81) }))).toThrow(InvalidSpaceError);
  });
});

describe('Space.create: the prefix has 2 to 5 uppercase letters A to Z', () => {
  it.each(['CA', 'CAD', 'CADEN'])('accepts the prefix %s', (prefix: string) => {
    expect(Space.create(newSpace({ prefix })).prefix).toBe(prefix);
  });

  it.each(['', 'C', 'CADENW', 'cad', 'Cad', 'CA1', 'C-D', 'CÉD', ' CAD', 'CAD '])(
    'refuses the prefix "%s"',
    (prefix: string) => {
      expect(() => Space.create(newSpace({ prefix }))).toThrow(InvalidSpaceError);
    },
  );
});

describe('Space.create: the description is trimmed, 500 characters at most, empty means none', () => {
  it('keeps no description when there is none', () => {
    expect(Space.create(newSpace({ description: null })).description).toBeNull();
  });

  it('turns an empty description into none', () => {
    expect(Space.create(newSpace({ description: '' })).description).toBeNull();
  });

  it('turns a description made only of spaces into none', () => {
    expect(Space.create(newSpace({ description: '  \n ' })).description).toBeNull();
  });

  it('trims the description', () => {
    expect(Space.create(newSpace({ description: '  Le produit.  ' })).description).toBe(
      'Le produit.',
    );
  });

  it('accepts a description of 500 characters and refuses one of 501', () => {
    expect(Space.create(newSpace({ description: 'a'.repeat(500) })).description).toHaveLength(500);
    expect(() => Space.create(newSpace({ description: 'a'.repeat(501) }))).toThrow(
      InvalidSpaceError,
    );
  });
});

describe('Space.create: a new space is complete and every status is in use', () => {
  it('starts with the ten statuses under their default label, none hidden', () => {
    const draft: SpaceDraft = Space.create(newSpace());

    expect(draft.statuses).toEqual(DEFAULT_SPACE_STATUSES);
    expect(Object.keys(draft.statuses)).toEqual([...STATUS_KEYS]);
  });

  it('keeps the look, the visibility, the organization and the owner as asked', () => {
    expect(
      Space.create(newSpace({ icon: null, color: 'fuchsia', visibility: 'private' })),
    ).toMatchObject({
      organizationId: ATELIER_NORD,
      ownerUserId: CAMILLE,
      icon: null,
      color: 'fuchsia',
      visibility: 'private',
    });
  });

  it('refuses an icon, a color or a visibility the contract does not list', () => {
    expect(() => Space.create(newSpace({ icon: 'sailboat' as NewSpace['icon'] }))).toThrow(
      InvalidSpaceError,
    );
    expect(() => Space.create(newSpace({ color: 'turquoise' as NewSpace['color'] }))).toThrow(
      InvalidSpaceError,
    );
    expect(() =>
      Space.create(newSpace({ visibility: 'shared' as NewSpace['visibility'] })),
    ).toThrow(InvalidSpaceError);
  });

  it('refuses a space with no organization or no owner', () => {
    expect(() => Space.create(newSpace({ organizationId: '' }))).toThrow(InvalidSpaceError);
    expect(() => Space.create(newSpace({ ownerUserId: '' }))).toThrow(InvalidSpaceError);
  });
});

describe('Space.restore: a stored space is a state a creation or a change could have produced', () => {
  it('restores a valid state unchanged', () => {
    const stored: SpaceState = spaceState({
      description: 'Le produit.',
      statuses: statuses({ progress: { name: 'En cours', hidden: false } }),
      version: 4,
    });

    expect(Space.restore(stored).snapshot).toEqual(stored);
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses the version %s', (version: number) => {
    expect(() => produit({ version })).toThrow(InvalidSpaceError);
  });

  it('refuses a name that is not trimmed or an empty description', () => {
    expect(() => produit({ name: ' Produit' })).toThrow(InvalidSpaceError);
    expect(() => produit({ description: '' })).toThrow(InvalidSpaceError);
  });

  it('refuses todo or done hidden', () => {
    expect(() => produit({ statuses: statuses({ todo: { name: null, hidden: true } }) })).toThrow(
      InvalidSpaceError,
    );
    expect(() => produit({ statuses: statuses({ done: { name: null, hidden: true } }) })).toThrow(
      InvalidSpaceError,
    );
  });

  it('refuses statuses that miss a key', () => {
    const incomplete: { -readonly [K in keyof SpaceStatuses]?: SpaceStatuses[K] } = {
      ...DEFAULT_SPACE_STATUSES,
    };
    delete incomplete.blocked;

    expect(() => produit({ statuses: incomplete as SpaceStatuses })).toThrow(InvalidSpaceError);
  });

  it('refuses a status name that is not trimmed', () => {
    expect(() =>
      produit({ statuses: statuses({ review: { name: ' Revue ', hidden: false } }) }),
    ).toThrow(InvalidSpaceError);
  });

  it('refuses a prefix, a color or an owner the space cannot have', () => {
    expect(() => produit({ prefix: 'cad' })).toThrow(InvalidSpaceError);
    expect(() => produit({ color: 'turquoise' as SpaceState['color'] })).toThrow(InvalidSpaceError);
    expect(() => produit({ ownerUserId: '' })).toThrow(InvalidSpaceError);
  });
});

describe('Space.update: a merge patch changes what it names and nothing else', () => {
  it('leaves untouched the members the patch leaves out', () => {
    const { space, changed }: SpaceUpdate = produit({
      description: 'Le produit.',
    }).update({ name: 'Plateforme' }, HUGO_VIEWER);

    expect(changed).toEqual(['name']);
    expect(space.snapshot).toEqual(
      spaceState({ name: 'Plateforme', description: 'Le produit.', version: 2 }),
    );
  });

  it('clears the description and the icon with null', () => {
    const { space, changed }: SpaceUpdate = produit({ description: 'Le produit.' }).update(
      { description: null, icon: null },
      HUGO_VIEWER,
    );

    expect(changed).toEqual(['description', 'icon']);
    expect(space.snapshot).toMatchObject({ description: null, icon: null });
  });

  it('turns an empty description into none', () => {
    const { space }: SpaceUpdate = produit({ description: 'Le produit.' }).update(
      { description: '   ' },
      HUGO_VIEWER,
    );

    expect(space.snapshot.description).toBeNull();
  });

  it('trims the new name and bounds it to 80 characters', () => {
    expect(produit().update({ name: '  Plateforme ' }, HUGO_VIEWER).space.snapshot.name).toBe(
      'Plateforme',
    );
    expect(() => produit().update({ name: ' ' }, HUGO_VIEWER)).toThrow(InvalidSpaceError);
    expect(() => produit().update({ name: 'a'.repeat(81) }, HUGO_VIEWER)).toThrow(
      InvalidSpaceError,
    );
  });

  it('refuses a prefix that is not 2 to 5 uppercase letters', () => {
    expect(() => produit().update({ prefix: 'produit' }, HUGO_VIEWER)).toThrow(InvalidSpaceError);
  });

  it('refuses an icon or a color the contract does not list', () => {
    expect(() => produit().update({ icon: 'sailboat' as SpaceState['icon'] }, HUGO_VIEWER)).toThrow(
      InvalidSpaceError,
    );
    expect(() =>
      produit().update({ color: 'turquoise' as SpaceState['color'] }, HUGO_VIEWER),
    ).toThrow(InvalidSpaceError);
  });

  it('lists the changed members in the order of the contract', () => {
    const { changed }: SpaceUpdate = produit().update(
      {
        statuses: { review: { name: 'Revue' } },
        visibility: 'private',
        color: 'vert',
        icon: 'flag',
        description: 'Le produit.',
        prefix: 'PRD',
        name: 'Plateforme',
      },
      CAMILLE_VIEWER,
    );

    expect(changed).toEqual([
      'name',
      'prefix',
      'description',
      'icon',
      'color',
      'visibility',
      'statuses',
    ]);
  });

  it('does not change the space it was called on', () => {
    const space: Space = produit();

    space.update({ name: 'Plateforme' }, HUGO_VIEWER);

    expect(space.snapshot).toEqual(spaceState());
  });
});

describe('Space.update: a change that changes nothing keeps the same instance and version', () => {
  it('returns the same space for an empty patch', () => {
    const space: Space = produit({ version: 3 });

    const update: SpaceUpdate = space.update({}, HUGO_VIEWER);

    expect(update.space).toBe(space);
    expect(update.changed).toEqual([]);
    expect(update.space.snapshot.version).toBe(3);
  });

  it('returns the same space when the patch sets the values the space already has', () => {
    const space: Space = produit({ description: 'Le produit.' });

    const update: SpaceUpdate = space.update(
      {
        name: 'Produit',
        prefix: 'CAD',
        description: 'Le produit.',
        icon: 'rocket',
        color: 'violet',
        visibility: 'organization',
        statuses: {},
      },
      LEA_VIEWER,
    );

    expect(update.space).toBe(space);
    expect(update.changed).toEqual([]);
  });

  it('compares the normalized values: a name with spaces around it is no change', () => {
    const space: Space = produit();

    expect(space.update({ name: ' Produit ' }, HUGO_VIEWER).space).toBe(space);
  });

  it('takes the next version only when something changes', () => {
    const space: Space = produit({ version: 3 });

    expect(space.update({ color: 'vert' }, HUGO_VIEWER).space.snapshot.version).toBe(4);
    expect(space.update({ color: 'violet' }, HUGO_VIEWER).space.snapshot.version).toBe(3);
  });

  test.prop([
    fc.string({ minLength: 1, maxLength: 80 }).filter((name: string) => name.trim() !== ''),
  ])('applies a valid name once: the same patch again changes nothing', (name: string) => {
    const first: SpaceUpdate = produit().update({ name }, HUGO_VIEWER);
    const second: SpaceUpdate = first.space.update({ name }, HUGO_VIEWER);

    expect(first.space.snapshot.name).toBe(name.trim());
    expect(second.space).toBe(first.space);
    expect(second.changed).toEqual([]);
  });
});

describe('Space.update: a status is renamed or hidden, never removed', () => {
  it('renames a status and trims its name', () => {
    const { space, changed }: SpaceUpdate = produit().update(
      { statuses: { progress: { name: '  En cours  ' } } },
      HUGO_VIEWER,
    );

    expect(changed).toEqual(['statuses']);
    expect(space.snapshot.statuses.progress).toEqual({ name: 'En cours', hidden: false });
    expect(space.snapshot.version).toBe(2);
  });

  it('leaves the other nine statuses as they were', () => {
    const { space }: SpaceUpdate = produit().update(
      { statuses: { progress: { name: 'En cours' } } },
      HUGO_VIEWER,
    );

    expect(space.snapshot.statuses).toEqual(
      statuses({ progress: { name: 'En cours', hidden: false } }),
    );
  });

  it('accepts a status name of 24 characters and refuses one of 25', () => {
    const renamed: SpaceUpdate = produit().update(
      { statuses: { review: { name: 'a'.repeat(24) } } },
      HUGO_VIEWER,
    );

    expect(renamed.space.snapshot.statuses.review.name).toHaveLength(24);
    expect(() =>
      produit().update({ statuses: { review: { name: 'a'.repeat(25) } } }, HUGO_VIEWER),
    ).toThrow(InvalidSpaceError);
  });

  it('refuses an empty status name or one made only of spaces', () => {
    expect(() => produit().update({ statuses: { review: { name: '' } } }, HUGO_VIEWER)).toThrow(
      InvalidSpaceError,
    );
    expect(() => produit().update({ statuses: { review: { name: '   ' } } }, HUGO_VIEWER)).toThrow(
      InvalidSpaceError,
    );
  });

  it('puts back the default label of a status with a null name, keeping it hidden or not', () => {
    const space: Space = produit({
      statuses: statuses({ testing: { name: 'Recette', hidden: true } }),
    });

    const { space: updated }: SpaceUpdate = space.update(
      { statuses: { testing: { name: null } } },
      HUGO_VIEWER,
    );

    expect(updated.snapshot.statuses.testing).toEqual({ name: null, hidden: true });
  });

  it('stops using a status other than todo and done', () => {
    const { space, changed }: SpaceUpdate = produit().update(
      { statuses: { blocked: { hidden: true } } },
      HUGO_VIEWER,
    );

    expect(changed).toEqual(['statuses']);
    expect(space.snapshot.statuses.blocked).toEqual({ name: null, hidden: true });
  });

  it('uses a hidden status again', () => {
    const space: Space = produit({
      statuses: statuses({ blocked: { name: 'Bloqué', hidden: true } }),
    });

    const { space: updated }: SpaceUpdate = space.update(
      { statuses: { blocked: { hidden: false } } },
      HUGO_VIEWER,
    );

    expect(updated.snapshot.statuses.blocked).toEqual({ name: 'Bloqué', hidden: false });
  });

  it('keeps the name of a status when the patch only hides it', () => {
    const space: Space = produit({
      statuses: statuses({ waiting: { name: 'En attente', hidden: false } }),
    });

    const { space: updated }: SpaceUpdate = space.update(
      { statuses: { waiting: { hidden: true } } },
      HUGO_VIEWER,
    );

    expect(updated.snapshot.statuses.waiting).toEqual({ name: 'En attente', hidden: true });
  });

  it('ignores a status patch that sets what the status already shows', () => {
    const space: Space = produit({
      statuses: statuses({ blocked: { name: 'Bloqué', hidden: true } }),
    });

    const update: SpaceUpdate = space.update(
      { statuses: { blocked: { name: 'Bloqué', hidden: true } } },
      HUGO_VIEWER,
    );

    expect(update.space).toBe(space);
    expect(update.changed).toEqual([]);
  });

  it('ignores a key that is not one of the ten statuses', () => {
    const space: Space = produit();

    const update: SpaceUpdate = space.update(
      { statuses: { archived: { hidden: true } } as never },
      HUGO_VIEWER,
    );

    expect(update.space).toBe(space);
    expect(update.changed).toEqual([]);
  });
});

describe('Space.update: todo and done are always used', () => {
  it.each(['todo', 'done'] as const)('refuses to hide %s and names it', (key) => {
    const error: unknown = thrownBy(() =>
      produit().update({ statuses: { [key]: { hidden: true } } }, HUGO_VIEWER),
    );

    expect(error).toBeInstanceOf(SpaceStatusRequiredError);
    expect(error).toMatchObject({ status: key });
  });

  it('refuses to hide done while renaming it in the same patch', () => {
    expect(() =>
      produit().update({ statuses: { done: { name: 'Livré', hidden: true } } }, HUGO_VIEWER),
    ).toThrow(SpaceStatusRequiredError);
  });

  it('refuses the whole patch: nothing else changes when a required status is hidden', () => {
    const space: Space = produit();

    expect(() =>
      space.update({ name: 'Plateforme', statuses: { todo: { hidden: true } } }, HUGO_VIEWER),
    ).toThrow(SpaceStatusRequiredError);
    expect(space.snapshot.name).toBe('Produit');
  });

  it('renames todo and done without hiding them', () => {
    const { space }: SpaceUpdate = produit().update(
      { statuses: { todo: { name: 'À faire' }, done: { name: 'Terminé', hidden: false } } },
      HUGO_VIEWER,
    );

    expect(space.snapshot.statuses.todo).toEqual({ name: 'À faire', hidden: false });
    expect(space.snapshot.statuses.done).toEqual({ name: 'Terminé', hidden: false });
  });
});

describe('Space.update: null puts the default statuses back', () => {
  const customized: SpaceStatuses = statuses({
    progress: { name: 'En cours', hidden: false },
    testing: { name: 'Recette', hidden: true },
    todo: { name: 'À faire', hidden: false },
  });

  it('puts back the default of one status with null for its key, whatever it was', () => {
    const { space, changed }: SpaceUpdate = produit({ statuses: customized }).update(
      { statuses: { testing: null } },
      HUGO_VIEWER,
    );

    expect(changed).toEqual(['statuses']);
    expect(space.snapshot.statuses.testing).toEqual({ name: null, hidden: false });
    expect(space.snapshot.statuses.progress).toEqual({ name: 'En cours', hidden: false });
  });

  it('puts back todo with null for its key, which uses it', () => {
    const { space }: SpaceUpdate = produit({ statuses: customized }).update(
      { statuses: { todo: null } },
      HUGO_VIEWER,
    );

    expect(space.snapshot.statuses.todo).toEqual({ name: null, hidden: false });
  });

  it('is no change for a status that already shows its default', () => {
    const space: Space = produit({ statuses: customized });

    expect(space.update({ statuses: { triage: null } }, HUGO_VIEWER).space).toBe(space);
  });

  it('puts back every default with statuses: null', () => {
    const { space, changed }: SpaceUpdate = produit({ statuses: customized }).update(
      { statuses: null },
      HUGO_VIEWER,
    );

    expect(changed).toEqual(['statuses']);
    expect(space.snapshot.statuses).toEqual(DEFAULT_SPACE_STATUSES);
    expect(space.snapshot.version).toBe(2);
  });

  it('is no change with statuses: null on a space that has its defaults', () => {
    const space: Space = produit();

    const update: SpaceUpdate = space.update({ statuses: null }, HUGO_VIEWER);

    expect(update.space).toBe(space);
    expect(update.changed).toEqual([]);
  });
});

describe('Space.update: only a member who manages the space changes its visibility', () => {
  it('refuses a member who does not own the space', () => {
    expect(() => produit().update({ visibility: 'private' }, LEA_VIEWER)).toThrow(
      SpaceVisibilityForbiddenError,
    );
  });

  it('refuses the member even when the patch also changes other members', () => {
    expect(() =>
      produit().update({ name: 'Plateforme', visibility: 'private' }, LEA_VIEWER),
    ).toThrow(SpaceVisibilityForbiddenError);
  });

  it('refuses a guest', () => {
    expect(() => produit().update({ visibility: 'private' }, NADIA_VIEWER)).toThrow(
      SpaceVisibilityForbiddenError,
    );
  });

  it('allows the owner of the space', () => {
    const { space, changed }: SpaceUpdate = Space.restore(designState()).update(
      { visibility: 'organization' },
      HUGO_VIEWER,
    );

    expect(changed).toEqual(['visibility']);
    expect(space.snapshot.visibility).toBe('organization');
    expect(space.snapshot.version).toBe(2);
  });

  it('allows the owner of the organization on a space of the organization they do not own', () => {
    const { changed }: SpaceUpdate = produit({ ownerUserId: HUGO }).update(
      { visibility: 'private' },
      CAMILLE_VIEWER,
    );

    expect(changed).toEqual(['visibility']);
  });

  it('refuses the owner and an admin of the organization on a private space they do not own', () => {
    for (const viewer of [CAMILLE_VIEWER, INES_VIEWER]) {
      expect(() =>
        Space.restore(designState()).update({ visibility: 'organization' }, viewer),
      ).toThrow(SpaceVisibilityForbiddenError);
    }
  });

  it('allows an admin on a space they do not own', () => {
    const { changed }: SpaceUpdate = produit({ ownerUserId: HUGO }).update(
      { visibility: 'private' },
      INES_VIEWER,
    );

    expect(changed).toEqual(['visibility']);
  });

  it('allows the member who owns the space to make it private', () => {
    const { space }: SpaceUpdate = produit({ ownerUserId: HUGO }).update(
      { visibility: 'private' },
      HUGO_VIEWER,
    );

    expect(space.snapshot.visibility).toBe('private');
  });

  it('is no change, and not refused, to set the visibility the space already has', () => {
    const space: Space = produit();

    const update: SpaceUpdate = space.update({ visibility: 'organization' }, LEA_VIEWER);

    expect(update.space).toBe(space);
    expect(update.changed).toEqual([]);
  });

  it('is no change, and not refused, for a guest to repeat the visibility of the space', () => {
    const space: Space = Space.restore(designState());

    expect(space.update({ visibility: 'private' }, NADIA_VIEWER).changed).toEqual([]);
  });

  it('leaves the other members to every member who sees the space', () => {
    const { changed }: SpaceUpdate = Space.restore(designState()).update(
      { name: 'Design system' },
      HUGO_VIEWER,
    );

    expect(changed).toEqual(['name']);
    expect(() => produit().update({ name: 'Plateforme', color: 'vert' }, LEA_VIEWER)).not.toThrow();
  });

  it('refuses a visibility the contract does not list', () => {
    expect(() =>
      produit().update({ visibility: 'shared' as SpaceState['visibility'] }, CAMILLE_VIEWER),
    ).toThrow(InvalidSpaceError);
  });
});

describe('Space.handOver: the owner of the organization takes a private space of a leaver', () => {
  it('changes the owner and takes the next version', () => {
    const { space, changed }: SpaceUpdate = Space.restore(designState({ version: 5 })).handOver(
      CAMILLE,
    );

    expect(changed).toEqual(['ownerUserId']);
    expect(space.snapshot).toEqual(designState({ ownerUserId: CAMILLE, version: 6 }));
  });

  it('keeps the same space and version when that account already owns it', () => {
    const space: Space = Space.restore(designState({ ownerUserId: CAMILLE }));

    const update: SpaceUpdate = space.handOver(CAMILLE);

    expect(update.space).toBe(space);
    expect(update.changed).toEqual([]);
  });

  it('refuses an empty account', () => {
    expect(() => Space.restore(designState()).handOver('')).toThrow(InvalidSpaceError);
  });

  it('does not change the space it was called on', () => {
    const space: Space = Space.restore(designState());

    space.handOver(CAMILLE);

    expect(space.snapshot).toEqual(designState());
  });

  it('lets the new owner see the private space and hides it from the former owner', () => {
    const { space }: SpaceUpdate = Space.restore(designState()).handOver(CAMILLE);

    expect(canSeeSpace(space.snapshot, CAMILLE_VIEWER, NO_GRANTS)).toBe(true);
    expect(canSeeSpace(space.snapshot, HUGO_VIEWER, NO_GRANTS)).toBe(false);
  });
});

describe('Space.recordAccessChange: a change of the grants takes the next version', () => {
  it('adds one to the version and keeps everything else', () => {
    expect(produit({ version: 3 }).recordAccessChange().snapshot).toEqual(
      spaceState({ version: 4 }),
    );
  });
});

describe('Space.handOver: a space that is not private keeps its owner', () => {
  it('returns the same space and no change for a space of the whole organization', () => {
    const space: Space = produit({ ownerUserId: HUGO });

    const update: SpaceUpdate = space.handOver(CAMILLE);

    expect(update.space).toBe(space);
    expect(update.changed).toEqual([]);
    expect(update.space.snapshot.version).toBe(1);
  });

  it('still refuses an empty account for a space of the whole organization', () => {
    expect(() => produit().handOver('')).toThrow(InvalidSpaceError);
  });
});

describe('Space.create: a new space never awaits an owner', () => {
  it('starts with awaitingOwner false, whatever its visibility', () => {
    expect(Space.create(newSpace()).awaitingOwner).toBe(false);
    expect(Space.create(newSpace({ visibility: 'private' })).awaitingOwner).toBe(false);
  });
});

describe('Space.restore: only a private space can await an owner', () => {
  it('restores a private space that awaits an owner unchanged', () => {
    const stored: SpaceState = designState({ awaitingOwner: true });

    expect(Space.restore(stored).snapshot).toEqual(stored);
  });

  it('refuses a space of the whole organization that awaits an owner', () => {
    expect(() => produit({ awaitingOwner: true })).toThrow(InvalidSpaceError);
  });
});

describe('Space.awaitOwner: the space of a leaver fails closed while the owner is unknown', () => {
  it('marks a private space, keeping its owner and its version', () => {
    const space: Space = Space.restore(designState({ version: 4 }));

    const awaiting: Space = space.awaitOwner();

    expect(awaiting.snapshot).toEqual(designState({ version: 4, awaitingOwner: true }));
  });

  it('does not change the space it was called on', () => {
    const space: Space = Space.restore(designState());

    space.awaitOwner();

    expect(space.snapshot).toEqual(designState());
  });

  it('returns the same space when it is already awaiting an owner', () => {
    const awaiting: Space = Space.restore(designState()).awaitOwner();

    expect(awaiting.awaitOwner()).toBe(awaiting);
  });

  it('returns the same space for a space of the whole organization', () => {
    const space: Space = produit({ ownerUserId: HUGO });

    expect(space.awaitOwner()).toBe(space);
  });

  it('hides the space from everyone, the former owner and the owner of the organization included', () => {
    const awaiting: Space = Space.restore(designState()).awaitOwner();

    for (const viewer of [HUGO_VIEWER, CAMILLE_VIEWER, INES_VIEWER, LEA_VIEWER, NADIA_VIEWER]) {
      expect(canSeeSpace(awaiting.snapshot, viewer, { space: 'edit', anyList: true })).toBe(false);
    }
  });
});

describe('Space.handOver: a space that awaits an owner stops awaiting', () => {
  it('gives the space to the owner of the organization at the next version, no longer awaiting', () => {
    const awaiting: Space = Space.restore(designState({ awaitingOwner: true }));

    const { space, changed }: SpaceUpdate = awaiting.handOver(CAMILLE);

    expect(changed).toEqual(['ownerUserId']);
    expect(space.snapshot).toEqual(
      designState({ ownerUserId: CAMILLE, version: 2, awaitingOwner: false }),
    );
    expect(canSeeSpace(space.snapshot, CAMILLE_VIEWER, NO_GRANTS)).toBe(true);
  });

  it('clears the wait with the same version and no change when that owner already owns the space', () => {
    const awaiting: Space = Space.restore(
      designState({ ownerUserId: CAMILLE, awaitingOwner: true, version: 3 }),
    );

    const { space, changed }: SpaceUpdate = awaiting.handOver(CAMILLE);

    expect(changed).toEqual([]);
    expect(space.snapshot).toEqual(designState({ ownerUserId: CAMILLE, version: 3 }));
    expect(space).not.toBe(awaiting);
  });

  it('keeps the same space when a private space that does not await an owner already has that owner', () => {
    const space: Space = Space.restore(designState({ ownerUserId: CAMILLE }));

    expect(space.handOver(CAMILLE).space).toBe(space);
  });

  it('does not clear the wait of a space for an empty account', () => {
    expect(() => Space.restore(designState({ awaitingOwner: true })).handOver('')).toThrow(
      InvalidSpaceError,
    );
  });
});

/** Camille Martin, who deletes a space, as the actor of its tombstone. */
const DELETED_BY_CAMILLE: ListActor = { type: 'user', id: CAMILLE };

/**
 * Restores "Produit" deleted by Camille Martin, at version 6.
 *
 * @param overrides - Fields to replace.
 * @returns The tombstone.
 */
function deletedProduit(overrides: Partial<SpaceState> = {}): Space {
  return produit({
    deletedAt: DELETED_AT,
    deletedBy: DELETED_BY_CAMILLE,
    version: 6,
    ...overrides,
  });
}

describe('Space.delete: a deletion records when and by whom, at the next version', () => {
  it('makes a tombstone of a live space at the next version and keeps everything else', () => {
    const deleted: Space = produit({ version: 5 }).delete(DELETED_BY_CAMILLE, DELETED_AT);

    expect(deleted.isDeleted).toBe(true);
    expect(deleted.snapshot).toEqual(
      spaceState({ deletedAt: DELETED_AT, deletedBy: DELETED_BY_CAMILLE, version: 6 }),
    );
  });

  it('does not change the space it was called on', () => {
    const live: Space = produit();

    live.delete(DELETED_BY_CAMILLE, DELETED_AT);

    expect(live.isDeleted).toBe(false);
    expect(live.snapshot).toEqual(spaceState());
  });

  it('keeps when the space came back from the trash before, which a deletion does not clear', () => {
    const deleted: Space = produit({ restoredAt: RESTORED_FROM_TRASH_AT }).delete(
      DELETED_BY_CAMILLE,
      DELETED_AT,
    );

    expect(deleted.snapshot.restoredAt).toEqual(RESTORED_FROM_TRASH_AT);
  });

  it('refuses to delete a deleted space again', () => {
    expect(() => deletedProduit().delete(DELETED_BY_CAMILLE, DELETED_AT)).toThrow(
      InvalidSpaceError,
    );
  });

  it.each<[string, ListActor]>([
    ['an unknown type', { type: 'robot', id: CAMILLE } as unknown as ListActor],
    ['an empty id', { type: 'user', id: '' }],
  ])('refuses an actor with %s', (_why: string, by: ListActor) => {
    expect(() => produit().delete(by, DELETED_AT)).toThrow(InvalidSpaceError);
  });

  it('refuses an invalid instant', () => {
    expect(() => produit().delete(DELETED_BY_CAMILLE, new Date(Number.NaN))).toThrow(
      InvalidSpaceError,
    );
  });
});

describe('Space.restoreFromTrash: a deleted space comes back at the end of the sidebar', () => {
  it('clears the tombstone, records when it came back and takes the next version', () => {
    const back: Space = deletedProduit().restoreFromTrash(RESTORED_FROM_TRASH_AT);

    expect(back.isDeleted).toBe(false);
    expect(back.snapshot).toEqual(spaceState({ restoredAt: RESTORED_FROM_TRASH_AT, version: 7 }));
  });

  it('keeps the settings of the space', () => {
    const back: Space = deletedProduit({
      visibility: 'private',
      ownerUserId: HUGO,
    }).restoreFromTrash(RESTORED_FROM_TRASH_AT);

    expect(back.snapshot).toMatchObject({
      visibility: 'private',
      ownerUserId: HUGO,
      prefix: 'CAD',
    });
  });

  it('refuses a live space', () => {
    expect(() => produit().restoreFromTrash(RESTORED_FROM_TRASH_AT)).toThrow(InvalidSpaceError);
  });

  it('refuses an invalid instant', () => {
    expect(() => deletedProduit().restoreFromTrash(new Date(Number.NaN))).toThrow(
      InvalidSpaceError,
    );
  });
});

describe('Space.restore: a stored tombstone is whole', () => {
  it('restores a deleted space unchanged', () => {
    expect(deletedProduit().snapshot).toEqual(
      spaceState({ deletedAt: DELETED_AT, deletedBy: DELETED_BY_CAMILLE, version: 6 }),
    );
  });

  it('refuses a deletion with an instant and no actor, or an actor and no instant', () => {
    expect(() => produit({ deletedAt: DELETED_AT })).toThrow(InvalidSpaceError);
    expect(() => produit({ deletedBy: DELETED_BY_CAMILLE })).toThrow(InvalidSpaceError);
  });

  it('refuses a stored actor of an unknown type or with an empty id', () => {
    expect(() =>
      produit({
        deletedAt: DELETED_AT,
        deletedBy: { type: 'robot', id: CAMILLE } as unknown as ListActor,
      }),
    ).toThrow(InvalidSpaceError);
    expect(() => produit({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: '' } })).toThrow(
      InvalidSpaceError,
    );
  });

  it('refuses an invalid instant of the deletion or of the restoration', () => {
    expect(() =>
      produit({ deletedAt: new Date(Number.NaN), deletedBy: DELETED_BY_CAMILLE }),
    ).toThrow(InvalidSpaceError);
    expect(() => produit({ restoredAt: new Date(Number.NaN) })).toThrow(InvalidSpaceError);
  });
});

describe('Space: the clean-up of a member who left still hands a deleted space over', () => {
  it('hands a deleted private space to the owner of the organization, keeping its tombstone', () => {
    const { space, changed }: SpaceUpdate = Space.restore(
      designState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: HUGO }, version: 3 }),
    ).handOver(CAMILLE);

    expect(changed).toEqual(['ownerUserId']);
    expect(space.snapshot).toMatchObject({
      ownerUserId: CAMILLE,
      deletedAt: DELETED_AT,
      version: 4,
    });
  });
});
