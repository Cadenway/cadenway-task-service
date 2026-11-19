import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
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
  listGrantOf,
  refusalOf,
  spaceGrantOf,
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

describe('GetList: a list is seen by whoever has a role on it', () => {
  it('returns Sprint 14 with its dates and goal to a member', async () => {
    const { list } = await new GetList(atelierNord(), atelierNordMembers()).execute(getSprint());

    expect(list).toEqual(sprintState());
  });

  it('returns the list Backlog, which is no sprint', async () => {
    const { list } = await new GetList(atelierNord(), atelierNordMembers()).execute(
      getSprint({ listId: BACKLOG }),
    );

    expect(list).toEqual(backlogState());
    expect(list.sprint).toBeNull();
  });

  it('returns a list of a private space to the owner of that space', async () => {
    const { list } = await new GetList(atelierNord(), atelierNordMembers()).execute(
      getSprint({ actorUserId: HUGO, listId: MAQUETTES }),
    );

    expect(list.spaceId).toBe(DESIGN);
  });

  it('reads an archived list by its id, with when and by whom it was archived', async () => {
    const archived = sprintState({
      archivedAt: ARCHIVED_AT,
      archivedBy: { type: 'user', id: CAMILLE },
      version: 2,
    });
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [archived] });

    const view = await new GetList(spaces, atelierNordMembers()).execute(getSprint());

    expect(view).toEqual({ list: archived, callerRole: 'edit' });
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

describe('GetList: the lists of a private space that awaits an owner are unknown to everyone', () => {
  it.each([
    ['its former owner', HUGO],
    ['the owner of the organization', CAMILLE],
  ])('hides them from %s', async (_who: string, actorUserId: string) => {
    const spaces = new InMemorySpaces({
      spaces: [designState({ awaitingOwner: true })],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN })],
    });

    const refusal = await refusalOf(
      new GetList(spaces, atelierNordMembers()).execute(
        getSprint({ actorUserId, listId: MAQUETTES }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });
});

describe('GetList: the effective role of the caller on the list', () => {
  it('answers edit to a member of the organization without reading grants (P3a unchanged)', async () => {
    const spaces = atelierNord();

    const view = await new GetList(spaces, atelierNordMembers()).execute(getSprint());

    expect(view.callerRole).toBe('edit');
    expect(spaces.viewerGrantsCalls).toEqual([]);
  });

  it('answers the role of the grant of the list to a guest, reading the grants in one statement', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState()],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'comment')],
    });

    const view = await new GetList(spaces, atelierNordMembers()).execute(
      getSprint({ actorUserId: NADIA }),
    );

    expect(view.callerRole).toBe('comment');
    expect(spaces.viewerGrantsCalls).toEqual([
      { viewerUserId: NADIA, spaceId: PRODUIT, listId: SPRINT_14 },
    ]);
  });

  it('answers the highest of the grant of the space and the grant of the list', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' })],
      grants: [spaceGrantOf(DESIGN, LEA, 'view'), listGrantOf(DESIGN, MAQUETTES, LEA, 'comment')],
    });

    const view = await new GetList(spaces, atelierNordMembers()).execute(
      getSprint({ listId: MAQUETTES }),
    );

    expect(view.callerRole).toBe('comment');
  });

  it('hides a list whose switch is off from a member of the organization it is not shared with', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ organizationAccess: false })],
    });

    const refusal = await refusalOf(
      new GetList(spaces, atelierNordMembers()).execute(getSprint({ actorUserId: INES })),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('shows a list whose switch is off to the owner of the space and to a grant of the space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ organizationAccess: false })],
      grants: [spaceGrantOf(PRODUIT, LEA, 'view')],
    });
    const getList = new GetList(spaces, atelierNordMembers());

    expect((await getList.execute(getSprint({ actorUserId: CAMILLE }))).callerRole).toBe('edit');
    expect((await getList.execute(getSprint())).callerRole).toBe('view');
  });
});
