import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DELETED_AT,
  InMemorySpaces,
  LEA,
  MARKETING,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_SPACE,
  backlogState,
  marketingState,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { ListDeletedSpaceLists } from './list-deleted-space-lists.use-case.js';

/** Who deleted the space or a list in these specs. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

describe('ListDeletedSpaceLists: where a space stands, held for share, and its deleted lists', () => {
  it('reads a deleted space and the lists deleted with it or on their own before, by id', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }), marketingState()],
      lists: [
        sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE }),
        backlogState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: LEA } }),
        backlogState({
          id: '019a7100-0000-7000-8000-000000000009',
          spaceId: MARKETING,
          deletedAt: DELETED_AT,
          deletedBy: { type: 'user', id: LEA },
        }),
      ],
    });

    const output = await new ListDeletedSpaceLists(spaces).execute({
      organizationId: ATELIER_NORD,
      spaceId: PRODUIT,
    });

    expect(output).toEqual({ space: 'deleted', listIds: [BACKLOG, SPRINT_14] });
  });

  it('holds the space for share before it reads the lists', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    await new ListDeletedSpaceLists(spaces).execute({
      organizationId: ATELIER_NORD,
      spaceId: PRODUIT,
    });

    expect(spaces.journal).toEqual([`space ${PRODUIT} share`]);
  });

  it('reads a space restored from the trash as live, with its lists still deleted', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ restoredAt: DELETED_AT, version: 7 })],
      lists: [sprintState(), backlogState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    expect(
      await new ListDeletedSpaceLists(spaces).execute({
        organizationId: ATELIER_NORD,
        spaceId: PRODUIT,
      }),
    ).toEqual({ space: 'live', listIds: [BACKLOG] });
  });

  it.each([
    ['an unknown or erased space, gone', ATELIER_NORD, UNKNOWN_SPACE],
    ['a space of another organization', OTHER_ORGANIZATION, PRODUIT],
  ])('reads nothing for %s', async (_why: string, organizationId: string, spaceId: string) => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    expect(await new ListDeletedSpaceLists(spaces).execute({ organizationId, spaceId })).toEqual({
      space: 'gone',
      listIds: [],
    });
  });
});
