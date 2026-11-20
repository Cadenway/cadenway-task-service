import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  HUGO,
  INES,
  InMemorySpaces,
  NADIA,
  PRODUIT,
  backlogState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import { FindListReaderAudience } from './find-list-reader-audience.use-case.js';

describe('FindListReaderAudience', () => {
  it('includes implicit non-guest access and only direct list grants for guests', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState()],
      grants: [
        spaceGrantOf(PRODUIT, INES, 'view'),
        listGrantOf(PRODUIT, BACKLOG, NADIA, 'comment'),
      ],
    });
    expect(
      await new FindListReaderAudience(spaces).execute({
        organizationId: ATELIER_NORD,
        listId: BACKLOG,
      }),
    ).toEqual({ allNonGuests: true, nonGuestIds: [], guestIds: [NADIA] });
  });

  it('uses the owner and explicit grants when organization access is off', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ ownerUserId: CAMILLE })],
      lists: [backlogState({ organizationAccess: false })],
      grants: [
        spaceGrantOf(PRODUIT, INES, 'view'),
        listGrantOf(PRODUIT, BACKLOG, HUGO, 'comment'),
        listGrantOf(PRODUIT, BACKLOG, NADIA, 'view'),
      ],
    });
    expect(
      await new FindListReaderAudience(spaces).execute({
        organizationId: ATELIER_NORD,
        listId: BACKLOG,
      }),
    ).toEqual({
      allNonGuests: false,
      nonGuestIds: [CAMILLE, INES, HUGO, NADIA],
      guestIds: [HUGO, NADIA],
    });
  });

  it('fails closed on spaces that await a new owner', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ visibility: 'private', awaitingOwner: true })],
      lists: [backlogState()],
      grants: [listGrantOf(PRODUIT, BACKLOG, NADIA, 'edit')],
    });
    expect(
      await new FindListReaderAudience(spaces).execute({
        organizationId: ATELIER_NORD,
        listId: BACKLOG,
      }),
    ).toBeNull();
  });
});
