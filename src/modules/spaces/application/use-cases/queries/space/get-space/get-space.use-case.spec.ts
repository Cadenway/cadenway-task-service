import { describe, expect, it } from 'vitest';

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
  backlogState,
  designState,
  listGrantOf,
  refusalOf,
  spaceGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import type { GetSpaceInput } from './get-space.input.js';
import { GetSpace } from './get-space.use-case.js';

/**
 * Builds the reading of the space "Produit" by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function getProduit(overrides: Partial<GetSpaceInput> = {}): GetSpaceInput {
  return { organizationId: ATELIER_NORD, actorUserId: LEA, spaceId: PRODUIT, ...overrides };
}

/** Atelier Nord with "Produit" (CAD) and the private "Design" (DES, Hugo Dubois). */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lastNumbers: { CAD: 481 },
  });
}

describe('GetSpace: a member reads a space they see, with its next key', () => {
  it('returns Produit with the key CAD-482 for its next task, edit for a member who does not manage it', async () => {
    const view = await new GetSpace(atelierNord(), atelierNordMembers()).execute(getProduit());

    expect(view).toEqual({
      space: spaceState(),
      nextKey: 'CAD-482',
      callerRole: 'edit',
      callerCanManage: false,
    });
  });

  it('starts the numbering at 1 for a space with no task yet', async () => {
    const view = await new GetSpace(atelierNord(), atelierNordMembers()).execute(
      getProduit({ actorUserId: HUGO, spaceId: DESIGN }),
    );

    expect(view.nextKey).toBe('DES-1');
  });

  it('reads the next number of that space only, once', async () => {
    const spaces = atelierNord();

    await new GetSpace(spaces, atelierNordMembers()).execute(getProduit());

    expect(spaces.nextNumbersCalls).toEqual([['CAD']]);
  });
});

describe('GetSpace: a space the caller does not see answers as an unknown one does', () => {
  it.each([
    ['the owner of the organization', CAMILLE],
    ['an admin', INES],
    ['another member', LEA],
  ])('hides the private Design from %s', async (_who: string, actorUserId: string) => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute(
        getProduit({ actorUserId, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
    expect(spaces.nextNumbersCalls).toEqual([]);
  });

  it('hides an organization space from a guest', async () => {
    const refusal = await refusalOf(
      new GetSpace(atelierNord(), atelierNordMembers()).execute(getProduit({ actorUserId: NADIA })),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers the same for a space that does not exist', async () => {
    const refusal = await refusalOf(
      new GetSpace(atelierNord(), atelierNordMembers()).execute(
        getProduit({ spaceId: UNKNOWN_SPACE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers the same for a space of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
    });

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute(getProduit()),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new GetSpace(atelierNord(), atelierNordMembers()).execute(
        getProduit({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('GetSpace: a read does not lock the membership of the caller', () => {
  it('asks the directory for the role of the caller without the lock', async () => {
    const members = atelierNordMembers();

    await new GetSpace(atelierNord(), members).execute(getProduit());

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: LEA, lock: false }]);
  });
});

describe('GetSpace: a private space that awaits an owner is unknown to everyone', () => {
  it.each([
    ['its former owner', HUGO],
    ['the owner of the organization', CAMILLE],
  ])('hides it from %s', async (_who: string, actorUserId: string) => {
    const spaces = new InMemorySpaces({ spaces: [designState({ awaitingOwner: true })] });

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute(
        getProduit({ actorUserId, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });
});

describe('GetSpace: the role of the caller on the space and whether they manage it', () => {
  it('reads no grant when the rule of the organization already gives edit (P3a unchanged)', async () => {
    const spaces = atelierNord();

    await new GetSpace(spaces, atelierNordMembers()).execute(getProduit());

    expect(spaces.viewerGrantsCalls).toEqual([]);
  });

  it('lets an admin manage a space of the organization', async () => {
    const view = await new GetSpace(atelierNord(), atelierNordMembers()).execute(
      getProduit({ actorUserId: INES }),
    );

    expect(view).toMatchObject({ callerRole: 'edit', callerCanManage: true });
  });

  it('shows the private Design to Léa Petit with the role its grant gives, without managing it', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), designState()],
      grants: [spaceGrantOf(DESIGN, LEA, 'view')],
    });

    const view = await new GetSpace(spaces, atelierNordMembers()).execute(
      getProduit({ spaceId: DESIGN }),
    );

    expect(view).toMatchObject({ callerRole: 'view', callerCanManage: false });
    expect(spaces.viewerGrantsCalls).toEqual([
      { viewerUserId: LEA, spaceId: DESIGN, listId: null },
    ]);
  });

  it('shows a guest the space of a list shared with them, with no role on the space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState()],
      grants: [listGrantOf(PRODUIT, backlogState().id, NADIA, 'comment')],
    });

    const view = await new GetSpace(spaces, atelierNordMembers()).execute(
      getProduit({ actorUserId: NADIA }),
    );

    expect(view).toMatchObject({ callerRole: null, callerCanManage: false });
  });

  it('gives nothing to a guest through a grant of the space they held as a member', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      grants: [spaceGrantOf(DESIGN, NADIA, 'edit')],
    });

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute(
        getProduit({ actorUserId: NADIA, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('gives nothing through a grant of a space that awaits an owner', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState({ awaitingOwner: true })],
      grants: [spaceGrantOf(DESIGN, LEA, 'edit')],
    });

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute(getProduit({ spaceId: DESIGN })),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
    expect(spaces.viewerGrantsCalls).toEqual([]);
  });
});
