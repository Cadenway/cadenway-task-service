import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  CAMILLE,
  DELETED_AT,
  InMemorySpaces,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { LockDeletedList } from './lock-deleted-list.use-case.js';

/** Who deleted the list in these specs. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

describe('LockDeletedList: a deleted list is locked, its space first, before a restoration or an erasure', () => {
  it('locks the space for no key update, then the deleted list for update, and answers deleted', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    const outcome = await new LockDeletedList(spaces).execute({
      organizationId: ATELIER_NORD,
      listId: SPRINT_14,
    });

    expect(outcome).toEqual({ outcome: 'deleted' });
    expect(spaces.reads).toEqual(['list']);
    expect(spaces.journal).toEqual([`space ${PRODUIT}`, `list ${SPRINT_14} delete`]);
  });

  it('answers live for a live list, an archived one included, without any lock', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE })],
    });

    expect(
      await new LockDeletedList(spaces).execute({
        organizationId: ATELIER_NORD,
        listId: SPRINT_14,
      }),
    ).toEqual({ outcome: 'live' });
    expect(spaces.journal).toEqual([]);
  });

  it.each([
    ['a list that does not exist, or was erased', ATELIER_NORD, UNKNOWN_LIST],
    ['a list of another organization', OTHER_ORGANIZATION, SPRINT_14],
  ])(
    'answers not-found for %s, without any lock',
    async (_why: string, organizationId: string, listId: string) => {
      const spaces = new InMemorySpaces({
        spaces: [spaceState()],
        lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
      });

      expect(await new LockDeletedList(spaces).execute({ organizationId, listId })).toEqual({
        outcome: 'not-found',
      });
      expect(spaces.journal).toEqual([]);
    },
  );

  it('reads the list again under the lock: live once restored, not-found once erased meanwhile', async () => {
    const tombstone = sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE });
    /**
     * A unit of work whose lock of the list finds the row a concurrent commit left.
     *
     * @param underLock - The row the lock finds, `null` for an erased list.
     * @returns The unit of work.
     */
    const lockingFinds = (underLock: TaskList | null): SpacesUnitOfWork => {
      const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [tombstone] });
      return {
        run: (work) =>
          spaces.run((store) =>
            work({
              ...store,
              lists: { ...store.lists, lockIncludingDeleted: () => Promise.resolve(underLock) },
            }),
          ),
      };
    };

    const live = await new LockDeletedList(
      lockingFinds(TaskList.restore(sprintState({ restoredAt: DELETED_AT, version: 2 }))),
    ).execute({ organizationId: ATELIER_NORD, listId: SPRINT_14 });
    const gone = await new LockDeletedList(lockingFinds(null)).execute({
      organizationId: ATELIER_NORD,
      listId: SPRINT_14,
    });

    expect(live).toEqual({ outcome: 'live' });
    expect(gone).toEqual({ outcome: 'not-found' });
  });

  it('writes nothing and appends nothing', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: BY_CAMILLE })],
    });

    await new LockDeletedList(spaces).execute({ organizationId: ATELIER_NORD, listId: SPRINT_14 });

    expect(spaces.lists.get(SPRINT_14)?.deletedAt).toEqual(DELETED_AT);
    expect(spaces.events).toEqual([]);
  });
});
