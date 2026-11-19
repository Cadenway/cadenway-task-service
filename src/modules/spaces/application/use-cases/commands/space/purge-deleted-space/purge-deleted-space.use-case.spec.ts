import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  DELETED_AT,
  InMemorySpaces,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  UNKNOWN_SPACE,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { PurgeDeletedSpace } from './purge-deleted-space.use-case.js';

/** "Produit", deleted by Camille Martin. */
const DELETED_PRODUIT = spaceState({
  deletedAt: DELETED_AT,
  deletedBy: { type: 'user', id: CAMILLE },
});

describe('PurgeDeletedSpace: a deleted space without a list is erased', () => {
  it('erases the space and its grants, its prefix kept reserved', async () => {
    const spaces = new InMemorySpaces({
      spaces: [DELETED_PRODUIT],
      grants: [spaceGrantOf(PRODUIT, NADIA, 'view')],
    });

    const outcome = await new PurgeDeletedSpace(spaces).execute({
      organizationId: ATELIER_NORD,
      spaceId: PRODUIT,
    });

    expect(outcome).toEqual({ outcome: 'purged' });
    expect(spaces.spaces.has(PRODUIT)).toBe(false);
    expect(spaces.grants).toEqual([]);
    expect(spaces.prefixOwners.get(`${ATELIER_NORD}/CAD`)).toBe(PRODUIT);
    expect(spaces.journal).toEqual([`space ${PRODUIT} delete`]);
    expect(spaces.events).toEqual([]);
  });

  it('answers not-empty while a list row of it is left, and writes nothing', async () => {
    const spaces = new InMemorySpaces({
      spaces: [DELETED_PRODUIT],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: CAMILLE } })],
    });

    expect(
      await new PurgeDeletedSpace(spaces).execute({
        organizationId: ATELIER_NORD,
        spaceId: PRODUIT,
      }),
    ).toEqual({ outcome: 'not-empty' });
    expect(spaces.spaces.has(PRODUIT)).toBe(true);
  });

  it('answers not-deleted for a live space', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });

    expect(
      await new PurgeDeletedSpace(spaces).execute({
        organizationId: ATELIER_NORD,
        spaceId: PRODUIT,
      }),
    ).toEqual({ outcome: 'not-deleted' });
    expect(spaces.spaces.has(PRODUIT)).toBe(true);
  });

  it.each([
    ['a space that does not exist, or was erased', ATELIER_NORD, UNKNOWN_SPACE],
    ['a space of another organization', OTHER_ORGANIZATION, PRODUIT],
  ])('answers not-found for %s', async (_why: string, organizationId: string, spaceId: string) => {
    const spaces = new InMemorySpaces({ spaces: [DELETED_PRODUIT] });

    expect(await new PurgeDeletedSpace(spaces).execute({ organizationId, spaceId })).toEqual({
      outcome: 'not-found',
    });
  });
});
