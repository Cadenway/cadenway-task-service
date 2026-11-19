import { describe, expect, it } from 'vitest';

import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import type { ViewerAccess } from '../../models/access/viewer-access.model.js';
import {
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  NADIA,
  PRODUIT,
  SPRINT_14,
  designState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../use-cases/spaces.fixture.js';
import { AccessResolver } from './access-resolver.service.js';

describe('AccessResolver: one reading of the grants, only when it can change the answer', () => {
  const access = new AccessResolver();

  it('reads nothing when the rule of the organization gives edit on the space and the list', async () => {
    const spaces = new InMemorySpaces();

    const resolved: ViewerAccess = await spaces.run((store: SpacesStore) =>
      access.resolve(store.grants, { userId: LEA, role: 'member' }, spaceState(), sprintState()),
    );

    expect(resolved).toEqual({
      seesSpace: true,
      spaceRole: 'edit',
      canManage: false,
      listRole: 'edit',
    });
    expect(spaces.viewerGrantsCalls).toEqual([]);
  });

  it('reads the grants of the space and the list in one call when the switch is off', async () => {
    const spaces = new InMemorySpaces({ grants: [listGrantOf(PRODUIT, SPRINT_14, LEA, 'view')] });

    const resolved: ViewerAccess = await spaces.run((store: SpacesStore) =>
      access.resolve(
        store.grants,
        { userId: LEA, role: 'member' },
        spaceState(),
        sprintState({ organizationAccess: false }),
      ),
    );

    expect(resolved).toEqual({
      seesSpace: true,
      spaceRole: 'edit',
      canManage: false,
      listRole: 'view',
    });
    expect(spaces.viewerGrantsCalls).toEqual([
      { viewerUserId: LEA, spaceId: PRODUIT, listId: SPRINT_14 },
    ]);
  });

  it('shows a guest a space through the grant of one of its lists, with no role on the space', async () => {
    const spaces = new InMemorySpaces({ grants: [listGrantOf(DESIGN, SPRINT_14, NADIA, 'edit')] });

    const resolved: ViewerAccess = await spaces.run((store: SpacesStore) =>
      access.resolve(store.grants, { userId: NADIA, role: 'guest' }, designState(), null),
    );

    expect(resolved).toEqual({
      seesSpace: true,
      spaceRole: null,
      canManage: false,
      listRole: null,
    });
  });

  it('gives the grant of a space to a member, and nothing to the owner of the organization on a private space', async () => {
    const spaces = new InMemorySpaces({ grants: [spaceGrantOf(DESIGN, INES, 'comment')] });

    const [ofInes, ofCamille, ofHugo] = await spaces.run((store: SpacesStore) =>
      Promise.all([
        access.resolve(store.grants, { userId: INES, role: 'admin' }, designState(), null),
        access.resolve(store.grants, { userId: CAMILLE, role: 'owner' }, designState(), null),
        access.resolve(store.grants, { userId: HUGO, role: 'member' }, designState(), null),
      ]),
    );

    expect(ofInes).toMatchObject({ seesSpace: true, spaceRole: 'comment', canManage: false });
    expect(ofCamille).toMatchObject({ seesSpace: false, spaceRole: null, canManage: false });
    expect(ofHugo).toMatchObject({ seesSpace: true, spaceRole: 'edit', canManage: true });
  });

  it('reads nothing for a space that awaits an owner, which nobody reaches', async () => {
    const spaces = new InMemorySpaces({ grants: [spaceGrantOf(DESIGN, LEA, 'edit')] });

    const resolved: ViewerAccess = await spaces.run((store: SpacesStore) =>
      access.resolve(
        store.grants,
        { userId: LEA, role: 'member' },
        designState({ awaitingOwner: true }),
        null,
      ),
    );

    expect(resolved.seesSpace).toBe(false);
    expect(spaces.viewerGrantsCalls).toEqual([]);
  });
});
