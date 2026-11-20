import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  DELETED_AT,
  DESIGN,
  HUGO,
  InMemorySpaces,
  LEA,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  designState,
  listGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { FindTrashListInput } from './find-trash-list.input.js';
import { FindTrashList } from './find-trash-list.use-case.js';

/** Who deleted a list or a space in these specs. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/**
 * Builds the reading of the trash list Sprint 14 for Léa Petit, a member.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function findSprint(overrides: Partial<FindTrashListInput> = {}): FindTrashListInput {
  return {
    organizationId: ATELIER_NORD,
    viewerUserId: LEA,
    viewerRole: 'member',
    listId: SPRINT_14,
    ...overrides,
  };
}

describe('FindTrashList: the list of an entry, with the role as if not deleted', () => {
  it('reads a deleted list of a deleted space with the role the member would have', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    expect(await new FindTrashList(spaces).execute(findSprint())).toEqual({
      list: { id: SPRINT_14, spaceId: PRODUIT, name: 'Sprint 14', state: 'deleted' },
      role: 'edit',
    });
  });

  it('reads a live list as active, with any role', async () => {
    const spaces = new InMemorySpaces({
      spaces: [designState()],
      lists: [sprintState({ spaceId: DESIGN })],
      grants: [listGrantOf(DESIGN, SPRINT_14, NADIA, 'view')],
    });

    expect(
      await new FindTrashList(spaces).execute(
        findSprint({ viewerUserId: NADIA, viewerRole: 'guest' }),
      ),
    ).toEqual({
      list: { id: SPRINT_14, spaceId: DESIGN, name: 'Sprint 14', state: 'active' },
      role: 'view',
    });
  });

  it.each([
    ['a deleted list of a private space of another', findSprint()],
    ['an unknown or erased list', findSprint({ viewerUserId: HUGO, listId: UNKNOWN_LIST })],
    [
      'a list of another organization',
      findSprint({ viewerUserId: HUGO, organizationId: OTHER_ORGANIZATION }),
    ],
  ])('answers null for %s', async (_why: string, input: FindTrashListInput) => {
    const spaces = new InMemorySpaces({
      spaces: [designState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: HUGO } })],
      lists: [
        sprintState({
          spaceId: DESIGN,
          deletedAt: DELETED_AT,
          deletedBy: { type: 'user', id: HUGO },
        }),
      ],
    });

    expect(await new FindTrashList(spaces).execute(input)).toBeNull();
  });

  it('takes no lock', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    await new FindTrashList(spaces).execute(findSprint());

    expect(spaces.journal).toEqual([]);
  });
});
