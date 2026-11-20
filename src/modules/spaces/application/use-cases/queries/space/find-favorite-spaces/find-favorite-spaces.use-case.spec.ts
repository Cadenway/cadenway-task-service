import { describe, expect, it } from 'vitest';

import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import {
  ATELIER_NORD,
  DESIGN,
  InMemorySpaces,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  backlogState,
  designState,
  listGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import { FindFavoriteSpaces } from './find-favorite-spaces.use-case.js';

describe('FindFavoriteSpaces', () => {
  it('returns an active shell visible through a list grant on both the read and held paths', async () => {
    const backlog = backlogState();
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), designState()],
      lists: [backlog],
      grants: [listGrantOf(PRODUIT, backlog.id, NADIA, 'view')],
    });
    const input = {
      organizationId: ATELIER_NORD,
      viewerUserId: NADIA,
      viewerRole: 'guest',
      spaceIds: [PRODUIT, DESIGN, PRODUIT],
    } as const;
    const useCase = new FindFavoriteSpaces(spaces);

    await expect(useCase.execute(input)).resolves.toEqual([{ id: PRODUIT, name: 'Produit' }]);
    expect(spaces.journal).toEqual([]);
    await expect(useCase.execute({ ...input, lock: true })).resolves.toEqual([
      { id: PRODUIT, name: 'Produit' },
    ]);
    await expect(
      useCase.execute({ ...input, organizationId: OTHER_ORGANIZATION }),
    ).resolves.toEqual([]);
    expect(spaces.journal).toEqual([`space ${PRODUIT}`]);
  });

  it('refuses a space whose only grant disappears while it waits for the lock', async () => {
    const backlog = backlogState();
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlog],
      grants: [listGrantOf(PRODUIT, backlog.id, NADIA, 'view')],
    });
    const concurrentRevocation: SpacesUnitOfWork = {
      run: (work) =>
        spaces.run((store) =>
          work({
            ...store,
            grants: {
              ...store.grants,
              viewerGrants: () => Promise.resolve({ space: null, list: null, anyList: false }),
            },
          }),
        ),
    };

    await expect(
      new FindFavoriteSpaces(concurrentRevocation).execute({
        organizationId: ATELIER_NORD,
        viewerUserId: NADIA,
        viewerRole: 'guest',
        spaceIds: [PRODUIT],
        lock: true,
      }),
    ).resolves.toEqual([]);
    expect(spaces.journal).toEqual([`space ${PRODUIT}`]);
  });
});
