import { describe, expect, it } from 'vitest';

import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import {
  CAMILLE,
  DELETED_AT,
  InMemorySpaces,
  ATELIER_NORD,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  UNKNOWN_SPACE,
  spaceState,
  sprintState,
} from '../../use-cases/spaces.fixture.js';
import { CheckedLocker } from './checked-locker.service.js';

/** A refusal the checks of these specs answer. */
const REFUSED = 'refused by the check' as const;

describe('CheckedLocker.space: a space is checked without lock, then locked, then checked again if it changed', () => {
  const locker = new CheckedLocker();

  it('locks the space in the mode asked once the check accepts the actor, checking it once', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState({ version: 4 })] });
    const checked: Space[] = [];

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.space(store, ATELIER_NORD, PRODUIT, 'update', (space: Space) => {
        checked.push(space);
        return Promise.resolve(null);
      }),
    );

    expect(outcome.outcome).toBe('locked');
    expect(checked).toHaveLength(1);
    expect(spaces.reads).toEqual(['space']);
    expect(spaces.journal).toEqual([`space ${PRODUIT}`]);
  });

  it('holds the space for share when asked', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });

    await spaces.run((store: SpacesStore) =>
      locker.space(store, ATELIER_NORD, PRODUIT, 'share', () => Promise.resolve(null)),
    );

    expect(spaces.journal).toEqual([`space ${PRODUIT} share`]);
  });

  it('answers the refusal of the check without any lock', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()] });

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.space(store, ATELIER_NORD, PRODUIT, 'update', () => Promise.resolve(REFUSED)),
    );

    expect(outcome).toEqual({ outcome: 'refused', refusal: REFUSED });
    expect(spaces.journal).toEqual([]);
  });

  it.each([
    ['an unknown space', [], UNKNOWN_SPACE],
    [
      'a deleted space',
      [spaceState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: CAMILLE } })],
      PRODUIT,
    ],
  ] as const)('answers unknown for %s, without any lock', async (_why, stored, spaceId) => {
    const spaces = new InMemorySpaces({ spaces: [...stored] });

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.space(store, ATELIER_NORD, spaceId, 'update', () => Promise.resolve(null)),
    );

    expect(outcome).toEqual({ outcome: 'unknown' });
    expect(spaces.journal).toEqual([]);
  });

  it('checks again on the locked space when it changed meanwhile, whose answer wins', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState({ version: 4 })] });
    const versions: number[] = [];

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.space(
        {
          ...store,
          spaces: {
            ...store.spaces,
            lock: async (organizationId: string, id: string): Promise<Space | null> => {
              const locked: Space | null = await store.spaces.lock(organizationId, id);
              return locked === null ? null : locked.recordAccessChange();
            },
          },
        },
        ATELIER_NORD,
        PRODUIT,
        'update',
        (space: Space) => {
          versions.push(space.snapshot.version);
          return Promise.resolve(space.snapshot.version === 5 ? REFUSED : null);
        },
      ),
    );

    expect(versions).toEqual([4, 5]);
    expect(outcome).toEqual({ outcome: 'refused', refusal: REFUSED });
  });
});

describe('CheckedLocker.list: a list and its space are checked without lock, then locked, then checked again', () => {
  const locker = new CheckedLocker();

  it('locks the space for share, then the list, once the check accepts the actor', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, SPRINT_14, 'share', () => Promise.resolve(null)),
    );

    expect(outcome.outcome).toBe('locked');
    expect(spaces.reads).toEqual(['list', 'space']);
    expect(spaces.journal).toEqual([`space ${PRODUIT} share`, `list ${SPRINT_14}`]);
  });

  it('locks the list alone when the space is not to be locked', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    await spaces.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, SPRINT_14, 'none', () => Promise.resolve(null)),
    );

    expect(spaces.journal).toEqual([`list ${SPRINT_14}`]);
  });

  it('answers the refusal of the check, or unknown for an unknown or deleted list, without any lock', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: CAMILLE } })],
    });
    const live = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    const deleted = await spaces.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, SPRINT_14, 'share', () => Promise.resolve(null)),
    );
    const unknown = await spaces.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, UNKNOWN_LIST, 'share', () => Promise.resolve(null)),
    );
    const refused = await live.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, SPRINT_14, 'share', () => Promise.resolve(REFUSED)),
    );

    expect([deleted, unknown, refused]).toEqual([
      { outcome: 'unknown' },
      { outcome: 'unknown' },
      { outcome: 'refused', refusal: REFUSED },
    ]);
    expect(spaces.journal).toEqual([]);
    expect(live.journal).toEqual([]);
  });

  it('checks again on the locked list when it changed, the space read again when it is not locked', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });
    const seen: boolean[] = [];

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.list(
        {
          ...store,
          lists: {
            ...store.lists,
            lock: async (organizationId: string, id: string): Promise<TaskList | null> => {
              const locked: TaskList | null = await store.lists.lock(organizationId, id);
              return locked === null ? null : locked.update({ organizationAccess: false }).list;
            },
          },
        },
        ATELIER_NORD,
        SPRINT_14,
        'none',
        (_space: Space, list: TaskList) => {
          seen.push(list.snapshot.organizationAccess);
          return Promise.resolve(list.snapshot.organizationAccess ? null : REFUSED);
        },
      ),
    );

    expect(seen).toEqual([true, false]);
    expect(outcome).toEqual({ outcome: 'refused', refusal: REFUSED });
    expect(spaces.reads).toEqual(['list', 'space', 'space']);
  });
});
