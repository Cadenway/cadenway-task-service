import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  CAMILLE,
  DELETED_AT,
  INES,
  InMemorySpaces,
  LEA,
  OTHER_ORGANIZATION,
  SPRINT_14,
  UNKNOWN_LIST,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { HoldList } from './hold-list.use-case.js';

describe('HoldList: a list a task joins is held for share, and read deleted or not', () => {
  it('answers live for a live list, an archived one included, and holds it for share', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: LEA } })],
    });

    const outcome = await new HoldList(spaces).execute({
      organizationId: ATELIER_NORD,
      listId: SPRINT_14,
    });

    expect(outcome).toEqual({ outcome: 'live' });
    expect(spaces.journal).toEqual([`list ${SPRINT_14} share`]);
  });

  it('answers deleted with who deleted the list', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: LEA } })],
    });

    expect(
      await new HoldList(spaces).execute({ organizationId: ATELIER_NORD, listId: SPRINT_14 }),
    ).toEqual({ outcome: 'deleted', deletedBy: { type: 'user', id: LEA } });
  });

  it('answers deleted with who deleted the space, the list deleted with it', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: INES } })],
      lists: [sprintState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: INES } })],
    });

    expect(
      await new HoldList(spaces).execute({ organizationId: ATELIER_NORD, listId: SPRINT_14 }),
    ).toEqual({ outcome: 'deleted', deletedBy: { type: 'user', id: INES } });
  });

  it('fails closed on a live list of a deleted space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: CAMILLE } })],
      lists: [sprintState()],
    });

    expect(
      await new HoldList(spaces).execute({ organizationId: ATELIER_NORD, listId: SPRINT_14 }),
    ).toEqual({ outcome: 'deleted', deletedBy: { type: 'user', id: CAMILLE } });
  });

  it.each([
    ['a list that does not exist, or was erased', ATELIER_NORD, UNKNOWN_LIST],
    ['a list of another organization', OTHER_ORGANIZATION, SPRINT_14],
  ])('answers not-found for %s', async (_why: string, organizationId: string, listId: string) => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    expect(await new HoldList(spaces).execute({ organizationId, listId })).toEqual({
      outcome: 'not-found',
    });
  });

  it('writes nothing and appends nothing', async () => {
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [sprintState()] });

    await new HoldList(spaces).execute({ organizationId: ATELIER_NORD, listId: SPRINT_14 });

    expect(spaces.lists.get(SPRINT_14)).toEqual(sprintState());
    expect(spaces.events).toEqual([]);
  });
});
