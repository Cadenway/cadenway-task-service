import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import {
  CAMILLE,
  CAMILLE_VIEWER,
  HUGO,
  HUGO_VIEWER,
  INES,
  INES_VIEWER,
  LEA_VIEWER,
  NADIA,
  NADIA_VIEWER,
  designState,
  spaceState,
} from '../../spaces.fixture.js';
import type { MemberRole } from '../../value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../value-objects/member/viewer.value-object.js';
import type { SpaceState } from '../../value-objects/space/space-state.value-object.js';
import { canChangeVisibility, canCreateSpace, canSeeSpace } from './space-access.policy.js';

describe('canSeeSpace: a guest sees no space in this version', () => {
  it('hides an organization space from a guest', () => {
    expect(canSeeSpace(spaceState(), NADIA_VIEWER)).toBe(false);
  });

  it('hides a private space from a guest, even the one they own', () => {
    expect(canSeeSpace(designState({ ownerUserId: NADIA }), NADIA_VIEWER)).toBe(false);
  });
});

describe('canSeeSpace: a private space is seen by its owner only', () => {
  it('shows a private space to its owner', () => {
    expect(canSeeSpace(designState(), HUGO_VIEWER)).toBe(true);
  });

  it('hides a private space from another member', () => {
    expect(canSeeSpace(designState(), LEA_VIEWER)).toBe(false);
  });

  it('hides a private space from the owner of the organization', () => {
    expect(canSeeSpace(designState(), CAMILLE_VIEWER)).toBe(false);
  });

  it('hides a private space from an admin', () => {
    expect(canSeeSpace(designState(), INES_VIEWER)).toBe(false);
  });

  it('shows a private space to its owner when the owner is an admin of the organization', () => {
    expect(canSeeSpace(designState({ ownerUserId: INES }), INES_VIEWER)).toBe(true);
  });

  it('fails closed on a visibility it does not know', () => {
    const unexpected: SpaceState = spaceState({
      visibility: 'shared' as SpaceState['visibility'],
      ownerUserId: HUGO,
    });

    expect(canSeeSpace(unexpected, LEA_VIEWER)).toBe(false);
    expect(canSeeSpace(unexpected, HUGO_VIEWER)).toBe(true);
  });
});

describe('canSeeSpace: an organization space is seen by every member but the guests', () => {
  it.each([
    ['Camille Martin, owner', CAMILLE_VIEWER],
    ['Inès Robert, admin', INES_VIEWER],
    ['Hugo Dubois, member', HUGO_VIEWER],
    ['Léa Petit, member', LEA_VIEWER],
  ])('shows the space Produit to %s', (_who: string, viewer: Viewer) => {
    expect(canSeeSpace(spaceState(), viewer)).toBe(true);
  });
});

/** The roles an account holds in an organization, as the property tests draw them. */
const roleArbitrary: fc.Arbitrary<MemberRole> = fc.constantFrom<MemberRole>(
  'owner',
  'admin',
  'member',
  'guest',
);

/** A pair of accounts, equal or not, drawn from the people of Atelier Nord. */
const accountArbitrary: fc.Arbitrary<string> = fc.constantFrom(CAMILLE, INES, HUGO, NADIA);

describe('canSeeSpace: whoever the viewer is, a private space shows to its owner only', () => {
  test.prop([roleArbitrary, accountArbitrary, accountArbitrary])(
    'is visible if and only if the viewer owns it and is not a guest',
    (role: MemberRole, viewerUserId: string, ownerUserId: string) => {
      const space: SpaceState = spaceState({ visibility: 'private', ownerUserId });
      const viewer: Viewer = { userId: viewerUserId, role };

      expect(canSeeSpace(space, viewer)).toBe(viewerUserId === ownerUserId && role !== 'guest');
    },
  );

  test.prop([roleArbitrary, accountArbitrary, accountArbitrary])(
    'never shows an organization space to a guest and always to the others',
    (role: MemberRole, viewerUserId: string, ownerUserId: string) => {
      const space: SpaceState = spaceState({ visibility: 'organization', ownerUserId });

      expect(canSeeSpace(space, { userId: viewerUserId, role })).toBe(role !== 'guest');
    },
  );
});

describe('canCreateSpace: every member but the guests creates spaces', () => {
  it.each([
    ['owner', CAMILLE_VIEWER, true],
    ['admin', INES_VIEWER, true],
    ['member', HUGO_VIEWER, true],
    ['guest', NADIA_VIEWER, false],
  ])('answers for the %s', (_role: string, viewer: Viewer, expected: boolean) => {
    expect(canCreateSpace(viewer)).toBe(expected);
  });
});

describe('canChangeVisibility: the owner of the space, or the owner or an admin of the organization', () => {
  it('allows the owner of the space', () => {
    expect(canChangeVisibility(designState(), HUGO_VIEWER)).toBe(true);
  });

  it('allows the owner of the organization on a space they do not own', () => {
    expect(canChangeVisibility(designState(), CAMILLE_VIEWER)).toBe(true);
  });

  it('allows an admin on a space they do not own', () => {
    expect(canChangeVisibility(designState(), INES_VIEWER)).toBe(true);
  });

  it('refuses a member who does not own the space', () => {
    expect(canChangeVisibility(designState(), LEA_VIEWER)).toBe(false);
  });

  it('refuses a guest, even on the space they own', () => {
    expect(canChangeVisibility(designState({ ownerUserId: NADIA }), NADIA_VIEWER)).toBe(false);
  });

  test.prop([roleArbitrary, accountArbitrary, accountArbitrary])(
    'allows exactly the owner of the space, the owner and the admins, never a guest',
    (role: MemberRole, viewerUserId: string, ownerUserId: string) => {
      const allowed: boolean =
        role !== 'guest' && (viewerUserId === ownerUserId || role === 'owner' || role === 'admin');

      expect(canChangeVisibility({ ownerUserId }, { userId: viewerUserId, role })).toBe(allowed);
    },
  );
});

describe('canSeeSpace: a private space that awaits an owner is seen by nobody', () => {
  it.each([
    ['its former owner', HUGO_VIEWER],
    ['the owner of the organization', CAMILLE_VIEWER],
    ['an admin', INES_VIEWER],
    ['another member', LEA_VIEWER],
    ['a guest', NADIA_VIEWER],
  ])('hides it from %s', (_who: string, viewer: Viewer) => {
    expect(canSeeSpace(designState({ awaitingOwner: true }), viewer)).toBe(false);
  });

  it('shows the same space again once it no longer awaits', () => {
    expect(canSeeSpace(designState({ awaitingOwner: false }), HUGO_VIEWER)).toBe(true);
  });

  test.prop([roleArbitrary, accountArbitrary, accountArbitrary])(
    'is visible if and only if the viewer owns it, is not a guest and the space does not await an owner',
    (role: MemberRole, viewerUserId: string, ownerUserId: string) => {
      for (const awaitingOwner of [false, true]) {
        const space: SpaceState = spaceState({
          visibility: 'private',
          ownerUserId,
          awaitingOwner,
        });

        expect(canSeeSpace(space, { userId: viewerUserId, role })).toBe(
          viewerUserId === ownerUserId && role !== 'guest' && !awaitingOwner,
        );
      }
    },
  );
});
