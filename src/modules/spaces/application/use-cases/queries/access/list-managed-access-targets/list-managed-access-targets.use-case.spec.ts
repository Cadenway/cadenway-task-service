import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  MARKETING,
  NADIA,
  PRODUIT,
  SPRINT_14,
  backlogState,
  designState,
  listGrantOf,
  marketingState,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { ListManagedAccessTargetsInput } from './list-managed-access-targets.input.js';
import { ListManagedAccessTargets } from './list-managed-access-targets.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Builds the listing for a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function managed(
  overrides: Partial<ListManagedAccessTargetsInput> = {},
): ListManagedAccessTargetsInput {
  return { organizationId: ATELIER_NORD, viewerUserId: LEA, viewerRole: 'member', ...overrides };
}

/**
 * Produit (Camille Martin) with Backlog and Sprint 14 (switch off), Marketing (Inès Robert), the
 * private Design (Hugo Dubois) with Maquettes, shared with Léa Petit; Nadia Benali edits Backlog.
 */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), marketingState(), designState()],
    lists: [
      backlogState(),
      sprintState({ organizationAccess: false }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
    grants: [spaceGrantOf(DESIGN, LEA, 'view'), listGrantOf(PRODUIT, BACKLOG, NADIA, 'edit')],
  });
}

describe('ListManagedAccessTargets: what a member answers access requests for', () => {
  it('gives the owner of the organization the spaces of the organization and the lists they edit', async () => {
    const targets = await new ListManagedAccessTargets(atelierNord()).execute(
      managed({ viewerUserId: CAMILLE, viewerRole: 'owner' }),
    );

    expect(targets).toEqual({ spaceIds: [PRODUIT, MARKETING], listIds: [BACKLOG, SPRINT_14] });
  });

  it('gives the owner of a private space that space and its lists', async () => {
    const targets = await new ListManagedAccessTargets(atelierNord()).execute(
      managed({ viewerUserId: HUGO }),
    );

    expect(targets).toEqual({ spaceIds: [DESIGN], listIds: [BACKLOG, MAQUETTES] });
  });

  it('gives a member no space, the lists they edit, and none they only view', async () => {
    const targets = await new ListManagedAccessTargets(atelierNord()).execute(managed());

    expect(targets).toEqual({ spaceIds: [], listIds: [BACKLOG] });
  });

  it('gives an admin the spaces of the organization only, not a private space', async () => {
    const targets = await new ListManagedAccessTargets(atelierNord()).execute(
      managed({ viewerUserId: INES, viewerRole: 'admin' }),
    );

    expect(targets.spaceIds).toEqual([PRODUIT, MARKETING]);
  });

  it('gives a guest the lists they edit and no space', async () => {
    const targets = await new ListManagedAccessTargets(atelierNord()).execute(
      managed({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(targets).toEqual({ spaceIds: [], listIds: [BACKLOG] });
  });
});
