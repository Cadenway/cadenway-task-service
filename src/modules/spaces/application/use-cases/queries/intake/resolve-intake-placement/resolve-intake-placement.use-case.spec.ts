import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  CAMILLE,
  DELETED_AT,
  DESIGN,
  INES,
  InMemorySpaces,
  LEA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  backlogState,
  designState,
  listGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { ResolveIntakePlacement } from './resolve-intake-placement.use-case.js';

describe('ResolveIntakePlacement', () => {
  it('holds the space before the list and returns current settings', async () => {
    const store = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });
    const result = await new ResolveIntakePlacement(store).execute({
      organizationId: ATELIER_NORD,
      listId: SPRINT_14,
      lock: true,
      viewer: { userId: LEA, role: 'member' },
    });
    expect(result).toEqual({
      spaceId: PRODUIT,
      listName: sprintState().name,
      archived: false,
      statuses: spaceState().statuses,
      role: 'edit',
    });
    expect(store.journal).toEqual([`space ${PRODUIT} share`, `list ${SPRINT_14} share`]);
  });

  it('returns archive state for a publication and performs a read without locks', async () => {
    const store = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: LEA } })],
    });
    expect(
      await new ResolveIntakePlacement(store).execute({
        organizationId: ATELIER_NORD,
        listId: SPRINT_14,
        lock: false,
      }),
    ).toMatchObject({ archived: true, role: null });
    expect(store.journal).toEqual([]);
  });

  it('rechecks private list grants after locking, and hides ungranted lists', async () => {
    const store = new InMemorySpaces({
      spaces: [designState()],
      lists: [backlogState({ id: SPRINT_14, spaceId: DESIGN })],
      grants: [listGrantOf(DESIGN, SPRINT_14, INES, 'view')],
    });
    const query = new ResolveIntakePlacement(store);
    const input = { organizationId: ATELIER_NORD, listId: SPRINT_14, lock: true };
    expect(
      await query.execute({ ...input, viewer: { userId: INES, role: 'member' } }),
    ).toMatchObject({ role: 'view' });
    expect(await query.execute({ ...input, viewer: { userId: LEA, role: 'member' } })).toBeNull();
  });

  it('fails closed for another tenant, deleted lists and deleted spaces', async () => {
    const input = { organizationId: ATELIER_NORD, listId: SPRINT_14, lock: true };
    const deleted = { type: 'user' as const, id: CAMILLE };
    const other = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });
    const list = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: deleted })],
    });
    const space = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: deleted })],
      lists: [sprintState()],
    });
    expect(
      await new ResolveIntakePlacement(other).execute({
        ...input,
        organizationId: OTHER_ORGANIZATION,
      }),
    ).toBeNull();
    expect(await new ResolveIntakePlacement(list).execute(input)).toBeNull();
    expect(await new ResolveIntakePlacement(space).execute(input)).toBeNull();
  });
});
