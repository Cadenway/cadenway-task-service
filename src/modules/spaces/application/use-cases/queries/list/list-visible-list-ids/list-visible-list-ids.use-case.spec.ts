import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DESIGN,
  HUGO,
  InMemorySpaces,
  LEA,
  MARKETING,
  NADIA,
  OTHER_ORGANIZATION,
  SPRINT_14,
  backlogState,
  designState,
  listGrantOf,
  marketingState,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { ListVisibleListIdsInput } from './list-visible-list-ids.input.js';
import { ListVisibleListIds } from './list-visible-list-ids.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** A list of "Marketing". */
const CAMPAGNES = '019a7100-0000-7000-8000-000000000004';

/**
 * Builds the listing for Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function visible(overrides: Partial<ListVisibleListIdsInput> = {}): ListVisibleListIdsInput {
  return { organizationId: ATELIER_NORD, viewerUserId: LEA, viewerRole: 'member', ...overrides };
}

/** Produit (Backlog, Sprint 14 with its switch off), Marketing (Campagnes), the private Design (Maquettes). */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState(), marketingState()],
    lists: [
      sprintState({ organizationAccess: false }),
      backlogState(),
      backlogState({ id: CAMPAGNES, spaceId: MARKETING, name: 'Campagnes' }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
    grants: [listGrantOf(MARKETING, CAMPAGNES, NADIA, 'view')],
  });
}

describe('ListVisibleListIds: every list a member has a role on, in sidebar order', () => {
  it('gives a member the lists of the spaces of the organization whose switch is on', async () => {
    const output = await new ListVisibleListIds(atelierNord()).execute(visible());

    expect(output).toEqual({ listIds: [BACKLOG, CAMPAGNES] });
  });

  it('gives the owner of a space every list of it, its private ones included', async () => {
    const spaces = atelierNord();
    const listing = new ListVisibleListIds(spaces);

    const ofCamille = await listing.execute(
      visible({ viewerUserId: CAMILLE, viewerRole: 'owner' }),
    );
    const ofHugo = await listing.execute(visible({ viewerUserId: HUGO }));

    expect(ofCamille.listIds).toEqual([BACKLOG, SPRINT_14, CAMPAGNES]);
    expect(ofHugo.listIds).toEqual([BACKLOG, MAQUETTES, CAMPAGNES]);
  });

  it('keeps an archived list, whose tasks stay in "Mes tâches" and "Accueil"', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState(),
        backlogState({ archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: CAMILLE } }),
      ],
    });

    const output = await new ListVisibleListIds(spaces).execute(visible());

    expect(output.listIds).toEqual([BACKLOG, SPRINT_14]);
    const live = await new ListVisibleListIds(spaces).execute(visible({ liveOnly: true }));
    expect(live.listIds).toEqual([SPRINT_14]);
  });

  it('puts a restored list at the end of its space, before the next space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), marketingState()],
      lists: [
        sprintState(),
        backlogState({ restoredAt: new Date('2026-11-08T17:00:00Z') }),
        backlogState({ id: CAMPAGNES, spaceId: MARKETING, name: 'Campagnes' }),
      ],
    });

    const output = await new ListVisibleListIds(spaces).execute(visible());

    expect(output.listIds).toEqual([SPRINT_14, BACKLOG, CAMPAGNES]);
  });

  it('gives a guest the lists shared with them only', async () => {
    const output = await new ListVisibleListIds(atelierNord()).execute(
      visible({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(output).toEqual({ listIds: [CAMPAGNES] });
  });

  it('answers no list of another organization', async () => {
    const output = await new ListVisibleListIds(atelierNord()).execute(
      visible({ organizationId: OTHER_ORGANIZATION }),
    );

    expect(output).toEqual({ listIds: [] });
  });

  it('leaves out the lists of a space that awaits an owner, for its former owner too', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), designState({ awaitingOwner: true })],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' })],
    });

    const output = await new ListVisibleListIds(spaces).execute(visible({ viewerUserId: HUGO }));

    expect(output).toEqual({ listIds: [] });
  });
});
