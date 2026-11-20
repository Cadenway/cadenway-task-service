import { describe, expect, it } from 'vitest';

import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import { CAMILLE_VIEWER, LEA_VIEWER, NADIA_VIEWER } from '../../../domain/spaces.fixture.js';
import type { EditableListLookup } from '../../models/list/editable-list-lookup.model.js';
import type { SpaceRefusalReason } from '../../models/space/space-refusal-reason.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import {
  ATELIER_NORD,
  DESIGN,
  InMemorySpaces,
  LEA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  backlogState,
  designState,
  listGrantOf,
  refusalOf,
  spaceState,
  sprintState,
} from '../../use-cases/spaces.fixture.js';
import { EditableListLocator } from './editable-list-locator.service.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** Atelier Nord: Sprint 14 (version 3) in "Produit", "Maquettes" in the private "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      sprintState({ version: 3 }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
  });
}

/** Atelier Nord with Sprint 14 (version 3) shared with Léa with `comment` only, its switch off. */
function sharedForComment(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState()],
    lists: [sprintState({ organizationAccess: false, version: 3 })],
    grants: [listGrantOf(PRODUIT, SPRINT_14, LEA, 'comment')],
  });
}

describe('EditableListLocator.find: the guard of a write of a list, without throwing', () => {
  const locator = new EditableListLocator();

  it('answers the locked list to an actor with edit on it, read then locked', async () => {
    const spaces = atelierNord();

    const found: EditableListLookup = await spaces.run((store: SpacesStore) =>
      locator.find(store, LEA_VIEWER, ATELIER_NORD, SPRINT_14),
    );

    expect(found.outcome).toBe('locked');
    expect(found.outcome === 'locked' ? found.list.snapshot : null).toEqual(
      sprintState({ version: 3 }),
    );
    expect(spaces.journal).toEqual([`list ${SPRINT_14}`]);
  });

  it.each([
    ['a list that does not exist', LEA_VIEWER, ATELIER_NORD, UNKNOWN_LIST],
    ['a list of another organization', LEA_VIEWER, OTHER_ORGANIZATION, SPRINT_14],
    ['a list of a private space of another', CAMILLE_VIEWER, ATELIER_NORD, MAQUETTES],
    ['a list a guest has no grant of', NADIA_VIEWER, ATELIER_NORD, SPRINT_14],
  ] as const)('answers list-not-found for %s', async (_why, viewer, organizationId, listId) => {
    const found: EditableListLookup = await atelierNord().run((store: SpacesStore) =>
      locator.find(store, viewer, organizationId, listId),
    );

    expect(found).toEqual({ outcome: 'list-not-found' });
  });

  it('answers list-not-found for a list whose space is not in the organization', async () => {
    const spaces = new InMemorySpaces({ spaces: [], lists: [sprintState()] });

    const found: EditableListLookup = await spaces.run((store: SpacesStore) =>
      locator.find(store, LEA_VIEWER, ATELIER_NORD, SPRINT_14),
    );

    expect(found).toEqual({ outcome: 'list-not-found' });
  });

  it('answers role-insufficient with the role of an actor without edit', async () => {
    const found: EditableListLookup = await sharedForComment().run((store: SpacesStore) =>
      locator.find(store, LEA_VIEWER, ATELIER_NORD, SPRINT_14),
    );

    expect(found).toEqual({ outcome: 'role-insufficient', role: 'comment' });
  });
});

describe('EditableListLocator.lock: the same guard, thrown, then If-Match', () => {
  const locator = new EditableListLocator();

  it('answers the locked list when If-Match names its version, or without the header', async () => {
    const spaces = atelierNord();

    const named: TaskList = await spaces.run((store: SpacesStore) =>
      locator.lock(store, LEA_VIEWER, ATELIER_NORD, SPRINT_14, [2, 3]),
    );
    const absent: TaskList = await spaces.run((store: SpacesStore) =>
      locator.lock(store, LEA_VIEWER, ATELIER_NORD, SPRINT_14, null),
    );

    expect(named.snapshot.version).toBe(3);
    expect(absent.snapshot.version).toBe(3);
  });

  it('refuses a list the actor does not see with list-not-found, before If-Match', async () => {
    const reason: SpaceRefusalReason = await refusalOf(
      atelierNord().run((store: SpacesStore) =>
        locator.lock(store, NADIA_VIEWER, ATELIER_NORD, SPRINT_14, [1]),
      ),
    );

    expect(reason).toEqual({ reason: 'list-not-found' });
  });

  it('refuses an actor without edit with role-insufficient, before If-Match', async () => {
    const reason: SpaceRefusalReason = await refusalOf(
      sharedForComment().run((store: SpacesStore) =>
        locator.lock(store, LEA_VIEWER, ATELIER_NORD, SPRINT_14, [1]),
      ),
    );

    expect(reason).toEqual({ reason: 'role-insufficient', role: 'comment' });
  });

  it('refuses a stale If-Match with version-mismatch and the stored version', async () => {
    const reason: SpaceRefusalReason = await refusalOf(
      atelierNord().run((store: SpacesStore) =>
        locator.lock(store, LEA_VIEWER, ATELIER_NORD, SPRINT_14, [1, 2]),
      ),
    );

    expect(reason).toEqual({ reason: 'version-mismatch', version: 3 });
  });
});

describe('EditableListLocator: the actor is checked on the list read without lock, before any lock', () => {
  const locator = new EditableListLocator();

  it.each([
    ['a list the actor does not see', CAMILLE_VIEWER, MAQUETTES, 'list-not-found'],
    ['a list they see without edit', LEA_VIEWER, SPRINT_14, 'role-insufficient'],
  ] as const)('refuses %s without locking it', async (_why, viewer, listId, outcome) => {
    const spaces = listId === SPRINT_14 ? sharedForComment() : atelierNord();

    const found: EditableListLookup = await spaces.run((store: SpacesStore) =>
      locator.find(store, viewer, ATELIER_NORD, listId),
    );

    expect(found.outcome).toBe(outcome);
    expect(spaces.journal).toEqual([]);
  });

  it('decides again on the locked list when it changed meanwhile, its switch turned off', async () => {
    const spaces = atelierNord();

    const found: EditableListLookup = await spaces.run((store: SpacesStore) =>
      locator.find(
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
        LEA_VIEWER,
        ATELIER_NORD,
        SPRINT_14,
      ),
    );

    expect(found).toEqual({ outcome: 'list-not-found' });
  });
});
