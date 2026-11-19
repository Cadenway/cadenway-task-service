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
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  backlogState,
  designState,
  listGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { FindVisibleListsInput } from './find-visible-lists.input.js';
import { FindVisibleLists } from './find-visible-lists.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Builds the lookup of Backlog, Sprint 14 and Maquettes by Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function find(overrides: Partial<FindVisibleListsInput> = {}): FindVisibleListsInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    listIds: [BACKLOG, SPRINT_14, MAQUETTES],
    ...overrides,
  };
}

/** Atelier Nord: Backlog and Sprint 14 (archived) in "Produit", "Maquettes" in the private "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      backlogState(),
      sprintState({ archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: CAMILLE } }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
  });
}

/**
 * The ids of the lists found, sorted, since the order is not part of the answer.
 *
 * @param lists - The lists found.
 * @returns Their ids, sorted.
 */
function idsOf(lists: readonly { readonly id: string }[]): string[] {
  return lists.map((list) => list.id).sort();
}

describe('FindVisibleLists: the lists asked for that the member has a role on', () => {
  it('finds the archived lists too, with their archive and the role of the member', async () => {
    const output = await new FindVisibleLists(atelierNord()).execute(find());

    expect(idsOf(output.lists)).toEqual([BACKLOG, SPRINT_14]);
    expect(output.lists.find((list) => list.id === SPRINT_14)).toMatchObject({
      archivedAt: ARCHIVED_AT,
      archivedBy: { type: 'user', id: CAMILLE },
      callerRole: 'edit',
    });
    expect(output.lists.find((list) => list.id === BACKLOG)).toMatchObject({
      archivedAt: null,
      archivedBy: null,
    });
  });

  it('gives the owner of a private space its lists', async () => {
    const output = await new FindVisibleLists(atelierNord()).execute(find({ viewerUserId: HUGO }));

    expect(idsOf(output.lists)).toEqual([BACKLOG, SPRINT_14, MAQUETTES]);
  });

  it('gives a guest the lists shared with them only, with the role of the grant', async () => {
    const spaces = atelierNord();
    spaces.grants = [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'comment')];

    const output = await new FindVisibleLists(spaces).execute(
      find({ viewerUserId: NADIA, viewerRole: 'guest' }),
    );

    expect(output.lists.map((list) => [list.id, list.callerRole])).toEqual([
      [SPRINT_14, 'comment'],
    ]);
  });

  it('leaves out a list that does not exist and a list of another organization', async () => {
    const output = await new FindVisibleLists(atelierNord()).execute(
      find({ listIds: [UNKNOWN_LIST, BACKLOG], organizationId: OTHER_ORGANIZATION }),
    );

    expect(output.lists).toEqual([]);
  });

  it('reads each list once, in lower case, and leaves out an id that is not a UUID', async () => {
    const spaces = atelierNord();

    const output = await new FindVisibleLists(spaces).execute(
      find({ listIds: [BACKLOG.toUpperCase(), BACKLOG, 'Sprint 14', ''] }),
    );

    expect(idsOf(output.lists)).toEqual([BACKLOG]);
    expect(spaces.listVisibleByIdsCalls).toEqual([[BACKLOG]]);
  });

  it('reads nothing when no id is left', async () => {
    const spaces = atelierNord();

    const output = await new FindVisibleLists(spaces).execute(find({ listIds: ['not-a-list'] }));

    expect(output).toEqual({ lists: [] });
    expect(spaces.runs).toBe(0);
  });

  it('accepts 100 ids and throws for more, a defect of the caller', async () => {
    const hundred: string[] = Array.from({ length: 100 }, () => BACKLOG);

    await expect(
      new FindVisibleLists(atelierNord()).execute(find({ listIds: hundred })),
    ).resolves.toMatchObject({ lists: [{ id: BACKLOG }] });
    await expect(
      new FindVisibleLists(atelierNord()).execute(find({ listIds: [...hundred, SPRINT_14] })),
    ).rejects.toThrow('FindVisibleLists reads 100 lists at most.');
  });

  it('takes no lock and appends no event', async () => {
    const spaces = atelierNord();

    await new FindVisibleLists(spaces).execute(find());

    expect(spaces.journal).toEqual([]);
    expect(spaces.events).toEqual([]);
  });
});
