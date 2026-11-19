import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  InMemorySpaces,
  LEA,
  NADIA,
  PRODUIT,
  SPRINT_14,
  atelierNordMembers,
  listGrantOf,
  refusalOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { RemoveListGrantInput } from './remove-list-grant.input.js';
import { RemoveListGrant } from './remove-list-grant.use-case.js';

/**
 * Builds Camille Martin removing the access of Léa Petit to Sprint 14 ("Retirer l’accès").
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function unshare(overrides: Partial<RemoveListGrantInput> = {}): RemoveListGrantInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    listId: SPRINT_14,
    userId: LEA,
    expectedVersions: null,
    ...overrides,
  };
}

/** Atelier Nord: Sprint 14 (version 5, switch off) shared with Léa Petit (edit) and Nadia Benali (view). */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState()],
    lists: [sprintState({ version: 5, organizationAccess: false })],
    grants: [
      listGrantOf(PRODUIT, SPRINT_14, LEA, 'edit'),
      listGrantOf(PRODUIT, SPRINT_14, NADIA, 'view'),
    ],
  });
}

describe('RemoveListGrant: who has edit on a list removes the grant of a person', () => {
  it('removes the grant at the next version of the list, with list.access-changed', async () => {
    const spaces = atelierNord();

    const removed = await new RemoveListGrant(spaces, atelierNordMembers()).execute(unshare());

    expect(removed).toEqual({ version: 6 });
    expect(spaces.events).toEqual([
      {
        kind: 'listAccessChanged',
        listId: SPRINT_14,
        spaceId: PRODUIT,
        version: 6,
        organizationAccess: false,
        grants: [{ userId: NADIA, role: 'view' }],
        changed: ['grants'],
        changedUserIds: [LEA],
        actor: { type: 'user', id: CAMILLE },
      },
    ]);
  });

  it('lets a person with edit through the grant of the list remove their own grant', async () => {
    const removed = await new RemoveListGrant(atelierNord(), atelierNordMembers()).execute(
      unshare({ actorUserId: LEA }),
    );

    expect(removed).toEqual({ version: 6 });
  });

  it('answers the same version for a person without a grant, writing and emitting nothing', async () => {
    const spaces = atelierNord();

    const removed = await new RemoveListGrant(spaces, atelierNordMembers()).execute(
      unshare({ userId: HUGO }),
    );

    expect(removed).toEqual({ version: 5 });
    expect(spaces.events).toEqual([]);
  });

  it('refuses owner-unchangeable for the owner of the space', async () => {
    const refusal = await refusalOf(
      new RemoveListGrant(atelierNord(), atelierNordMembers()).execute(
        unshare({ actorUserId: LEA, userId: CAMILLE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'owner-unchangeable' });
  });

  it('refuses role-insufficient to a guest with view, before If-Match', async () => {
    const refusal = await refusalOf(
      new RemoveListGrant(atelierNord(), atelierNordMembers()).execute(
        unshare({ actorUserId: NADIA, expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('answers list-not-found to a member of the organization when the switch is off and nothing is shared', async () => {
    const refusal = await refusalOf(
      new RemoveListGrant(atelierNord(), atelierNordMembers()).execute(
        unshare({ actorUserId: HUGO }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('refuses a stale If-Match with the version of the list', async () => {
    const refusal = await refusalOf(
      new RemoveListGrant(atelierNord(), atelierNordMembers()).execute(
        unshare({ expectedVersions: [4] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 5 });
  });
});
