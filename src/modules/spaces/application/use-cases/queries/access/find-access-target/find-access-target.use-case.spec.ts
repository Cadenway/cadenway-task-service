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
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  UNKNOWN_SPACE,
  designState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { FindAccessTargetInput } from './find-access-target.input.js';
import { FindAccessTarget } from './find-access-target.use-case.js';

/**
 * Builds Léa Petit, a member, looking at the private space Design.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function find(overrides: Partial<FindAccessTargetInput> = {}): FindAccessTargetInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    target: { kind: 'space', spaceId: DESIGN },
    ...overrides,
  };
}

/** Produit with Sprint 14 (switch off) shared with Nadia Benali; the private Design shared with Inès Robert. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [sprintState({ organizationAccess: false })],
    grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit'), spaceGrantOf(DESIGN, INES, 'comment')],
  });
}

describe('FindAccessTarget: the target of an access request, seen or not', () => {
  it('finds a private space the member does not see, with its owner and no role', async () => {
    const target = await new FindAccessTarget(atelierNord()).execute(find());

    expect(target).toEqual({
      kind: 'space',
      spaceId: DESIGN,
      spaceName: 'Design',
      spaceOwnerUserId: HUGO,
      listId: null,
      listName: null,
      viewerRole: null,
      viewerManages: false,
    });
  });

  it('answers the role of the grant of a space, which does not make its holder manage it', async () => {
    const target = await new FindAccessTarget(atelierNord()).execute(
      find({ viewerUserId: INES, viewerRole: 'admin' }),
    );

    expect(target).toMatchObject({ viewerRole: 'comment', viewerManages: false });
  });

  it('answers that the owner of the space manages it', async () => {
    const target = await new FindAccessTarget(atelierNord()).execute(find({ viewerUserId: HUGO }));

    expect(target).toMatchObject({ viewerRole: 'edit', viewerManages: true });
  });

  it('finds a list with the role on the list, and answers whether the member has edit there', async () => {
    const finder = new FindAccessTarget(atelierNord());
    const ofNadia = await finder.execute(
      find({
        viewerUserId: NADIA,
        viewerRole: 'guest',
        target: { kind: 'list', listId: SPRINT_14 },
      }),
    );
    const ofLea = await finder.execute(find({ target: { kind: 'list', listId: SPRINT_14 } }));

    expect(ofNadia).toEqual({
      kind: 'list',
      spaceId: PRODUIT,
      spaceName: 'Produit',
      spaceOwnerUserId: CAMILLE,
      listId: SPRINT_14,
      listName: 'Sprint 14',
      viewerRole: 'edit',
      viewerManages: true,
    });
    expect(ofLea).toMatchObject({ viewerRole: null, viewerManages: false });
  });

  it.each([
    ['a space', { kind: 'space', spaceId: UNKNOWN_SPACE }],
    ['a list', { kind: 'list', listId: UNKNOWN_LIST }],
  ] as const)('answers null for %s the organization does not have', async (_kind, target) => {
    expect(await new FindAccessTarget(atelierNord()).execute(find({ target }))).toBeNull();
  });
});
