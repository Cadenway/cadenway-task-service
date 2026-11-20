import { describe, expect, it } from 'vitest';

import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import { Space } from '../../../domain/aggregates/space/space.aggregate.js';
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

describe('CheckedLocker.list: the space is held for share before the list is locked, and the role checked again when either changed', () => {
  const locker = new CheckedLocker();

  it('always locks the space for share before the list, and checks once when neither changed', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });
    let checks: number = 0;

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, SPRINT_14, () => {
        checks += 1;
        return Promise.resolve(null);
      }),
    );

    expect(outcome.outcome).toBe('locked');
    expect(checks).toBe(1);
    expect(spaces.reads).toEqual(['list', 'space']);
    expect(spaces.journal).toEqual([`space ${PRODUIT} share`, `list ${SPRINT_14}`]);
  });

  it('answers the refusal of the check, or unknown for an unknown or deleted list, without any lock', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: CAMILLE } })],
    });
    const live = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    const deleted = await spaces.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, SPRINT_14, () => Promise.resolve(null)),
    );
    const unknown = await spaces.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, UNKNOWN_LIST, () => Promise.resolve(null)),
    );
    const refused = await live.run((store: SpacesStore) =>
      locker.list(store, ATELIER_NORD, SPRINT_14, () => Promise.resolve(REFUSED)),
    );

    expect([deleted, unknown, refused]).toEqual([
      { outcome: 'unknown' },
      { outcome: 'unknown' },
      { outcome: 'refused', refusal: REFUSED },
    ]);
    expect(spaces.journal).toEqual([]);
    expect(live.journal).toEqual([]);
  });

  it('refuses when the space was made private while the locks waited, its new version checked again', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });
    const visibilities: string[] = [];

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.list(
        {
          ...store,
          spaces: {
            ...store.spaces,
            lockShared: async (organizationId: string, id: string): Promise<Space | null> => {
              const locked: Space | null = await store.spaces.lockShared(organizationId, id);
              return locked === null
                ? null
                : Space.restore({
                    ...locked.snapshot,
                    visibility: 'private',
                    version: locked.snapshot.version + 1,
                  });
            },
          },
        },
        ATELIER_NORD,
        SPRINT_14,
        (space: Space) => {
          visibilities.push(space.snapshot.visibility);
          return Promise.resolve(space.snapshot.visibility === 'private' ? REFUSED : null);
        },
      ),
    );

    expect(visibilities).toEqual(['organization', 'private']);
    expect(outcome).toEqual({ outcome: 'refused', refusal: REFUSED });
    expect(spaces.journal).toEqual([`space ${PRODUIT} share`, `list ${SPRINT_14}`]);
  });

  it('checks again on the locked rows when the list changed, without reading the space again', async () => {
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
        (_space: Space, list: TaskList) => {
          seen.push(list.snapshot.organizationAccess);
          return Promise.resolve(list.snapshot.organizationAccess ? null : REFUSED);
        },
      ),
    );

    expect(seen).toEqual([true, false]);
    expect(outcome).toEqual({ outcome: 'refused', refusal: REFUSED });
    expect(spaces.reads).toEqual(['list', 'space']);
  });

  it('locks the rows when the check accepts the changed space again, with the locked versions', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ version: 4 })],
      lists: [sprintState()],
    });
    const versions: number[] = [];

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.list(
        {
          ...store,
          spaces: {
            ...store.spaces,
            lockShared: async (organizationId: string, id: string): Promise<Space | null> => {
              const locked: Space | null = await store.spaces.lockShared(organizationId, id);
              return locked === null ? null : locked.recordAccessChange();
            },
          },
        },
        ATELIER_NORD,
        SPRINT_14,
        (space: Space) => {
          versions.push(space.snapshot.version);
          return Promise.resolve(null);
        },
      ),
    );

    expect(versions).toEqual([4, 5]);
    expect(outcome.outcome === 'locked' ? outcome.locked.space.snapshot.version : null).toBe(5);
  });

  it('answers unknown when the space was erased while its lock waited', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    const outcome = await spaces.run((store: SpacesStore) =>
      locker.list(
        {
          ...store,
          spaces: {
            ...store.spaces,
            lockShared: (): Promise<Space | null> => Promise.resolve(null),
          },
        },
        ATELIER_NORD,
        SPRINT_14,
        () => Promise.resolve(null),
      ),
    );

    expect(outcome).toEqual({ outcome: 'unknown' });
  });
});
