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
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  UNKNOWN_SPACE,
  atelierNordMembers,
  backlogState,
  designState,
  refusalOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { GetListInput } from './get-list.input.js';
import { GetList } from './get-list.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Builds the reading of Sprint 14 by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function getSprint(overrides: Partial<GetListInput> = {}): GetListInput {
  return { organizationId: ATELIER_NORD, actorUserId: LEA, listId: SPRINT_14, ...overrides };
}

/** Atelier Nord: Backlog and Sprint 14 in "Produit", "Maquettes" in the private "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      backlogState(),
      sprintState(),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
  });
}

describe('GetList: a list is seen by whoever sees its space', () => {
  it('returns Sprint 14 with its dates and goal to a member', async () => {
    const list = await new GetList(atelierNord(), atelierNordMembers()).execute(getSprint());

    expect(list).toEqual(sprintState());
  });

  it('returns the list Backlog, which is no sprint', async () => {
    const list = await new GetList(atelierNord(), atelierNordMembers()).execute(
      getSprint({ listId: BACKLOG }),
    );

    expect(list).toEqual(backlogState());
    expect(list.sprint).toBeNull();
  });

  it('returns a list of a private space to the owner of that space', async () => {
    const list = await new GetList(atelierNord(), atelierNordMembers()).execute(
      getSprint({ actorUserId: HUGO, listId: MAQUETTES }),
    );

    expect(list.spaceId).toBe(DESIGN);
  });
});

describe('GetList: a list of a space the caller does not see answers as an unknown list does', () => {
  it.each([
    ['the owner of the organization', CAMILLE],
    ['an admin', INES],
    ['another member', LEA],
  ])('hides a list of the private Design from %s', async (_who: string, actorUserId: string) => {
    const refusal = await refusalOf(
      new GetList(atelierNord(), atelierNordMembers()).execute(
        getSprint({ actorUserId, listId: MAQUETTES }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('hides a list of an organization space from a guest', async () => {
    const refusal = await refusalOf(
      new GetList(atelierNord(), atelierNordMembers()).execute(getSprint({ actorUserId: NADIA })),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers the same for a list that does not exist', async () => {
    const refusal = await refusalOf(
      new GetList(atelierNord(), atelierNordMembers()).execute(getSprint({ listId: UNKNOWN_LIST })),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers the same for a list of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [sprintState({ organizationId: OTHER_ORGANIZATION })],
    });

    const refusal = await refusalOf(new GetList(spaces, atelierNordMembers()).execute(getSprint()));

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers the same for a list whose space is not in the organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ id: UNKNOWN_SPACE })],
      lists: [sprintState({ spaceId: PRODUIT })],
    });

    const refusal = await refusalOf(new GetList(spaces, atelierNordMembers()).execute(getSprint()));

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new GetList(atelierNord(), atelierNordMembers()).execute(
        getSprint({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('GetList: a read does not lock the membership of the caller', () => {
  it('asks the directory for the role of the caller without the lock', async () => {
    const members = atelierNordMembers();

    await new GetList(atelierNord(), members).execute(getSprint());

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: LEA, lock: false }]);
  });
});
