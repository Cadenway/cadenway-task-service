import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DESIGN,
  InMemorySpaces,
  LEA,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  TRANSACTION_INSTANT,
  UNKNOWN_LIST,
  atelierNordMembers,
  backlogState,
  designState,
  listGrantOf,
  refusalOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { ListLists } from '../../../queries/list/list-lists/list-lists.use-case.js';
import type { UnarchiveListInput } from './unarchive-list.input.js';
import { UnarchiveList } from './unarchive-list.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/** Camille Martin, who archived Sprint 14 on 3 November. */
const BY_CAMILLE = { type: 'user', id: CAMILLE } as const;

/**
 * Builds the restoration of Sprint 14 by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function unarchiveSprint(overrides: Partial<UnarchiveListInput> = {}): UnarchiveListInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    listId: SPRINT_14,
    expectedVersions: null,
    ...overrides,
  };
}

/** Atelier Nord: Backlog and Sprint 14 (archived, version 4) in "Produit", "Maquettes" in "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      backlogState({ createdAt: new Date('2026-10-21T09:00:00Z') }),
      sprintState({ archivedAt: ARCHIVED_AT, archivedBy: BY_CAMILLE, version: 4 }),
      backlogState({
        id: MAQUETTES,
        spaceId: DESIGN,
        name: 'Maquettes',
        archivedAt: ARCHIVED_AT,
        archivedBy: BY_CAMILLE,
      }),
    ],
  });
}

describe('UnarchiveList: a member with edit on the list restores it at the end of its space', () => {
  it('clears the archive, records the instant of the transaction and takes the next version', async () => {
    const spaces = atelierNord();

    const view = await new UnarchiveList(spaces, atelierNordMembers()).execute(unarchiveSprint());

    const restored = sprintState({ restoredAt: TRANSACTION_INSTANT, version: 5 });
    expect(view).toEqual({ list: restored, callerRole: 'edit' });
    expect(spaces.lists.get(SPRINT_14)).toEqual(restored);
  });

  it('appends list.unarchived with the version after the restoration, by the actor', async () => {
    const spaces = atelierNord();

    await new UnarchiveList(spaces, atelierNordMembers()).execute(unarchiveSprint());

    expect(spaces.events).toEqual([
      {
        kind: 'listUnarchived',
        listId: SPRINT_14,
        version: 5,
        restoredAt: TRANSACTION_INSTANT,
        actor: { type: 'user', id: LEA },
      },
    ]);
  });

  it('puts the restored list back in the lists of its space, after those created before', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();

    const before = await new ListLists(spaces, members).execute({
      organizationId: ATELIER_NORD,
      actorUserId: LEA,
      spaceId: PRODUIT,
      after: null,
      limit: 50,
    });
    await new UnarchiveList(spaces, members).execute(unarchiveSprint());
    const after = await new ListLists(spaces, members).execute({
      organizationId: ATELIER_NORD,
      actorUserId: LEA,
      spaceId: PRODUIT,
      after: null,
      limit: 50,
    });

    expect(before.items.map((item) => item.list.id)).toEqual([BACKLOG]);
    expect(after.items.map((item) => item.list.id)).toEqual([BACKLOG, SPRINT_14]);
  });
});

describe('UnarchiveList: a live list answers the same version and emits nothing', () => {
  it('keeps the list, its version and the outbox as they were', async () => {
    const spaces = atelierNord();

    const view = await new UnarchiveList(spaces, atelierNordMembers()).execute(
      unarchiveSprint({ listId: BACKLOG }),
    );

    expect(view.list).toEqual(backlogState({ createdAt: new Date('2026-10-21T09:00:00Z') }));
    expect(spaces.events).toEqual([]);
  });

  it('is repeatable: restoring twice appends one event only', async () => {
    const spaces = atelierNord();
    const unarchive = new UnarchiveList(spaces, atelierNordMembers());

    await unarchive.execute(unarchiveSprint());
    const again = await unarchive.execute(unarchiveSprint());

    expect(again.list.version).toBe(5);
    expect(spaces.events).toHaveLength(1);
  });
});

describe('UnarchiveList: the refusals come in the order 404, 403, 412', () => {
  /**
   * Atelier Nord with Sprint 14 archived (version 4), its switch off, shared with Léa Petit.
   *
   * @param role - The role of the grant of Léa Petit on Sprint 14.
   * @returns The fake store.
   */
  function sprintShared(role: 'edit' | 'comment' | 'view'): InMemorySpaces {
    return new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState({
          archivedAt: ARCHIVED_AT,
          archivedBy: BY_CAMILLE,
          organizationAccess: false,
          version: 4,
        }),
      ],
      grants: [listGrantOf(PRODUIT, SPRINT_14, LEA, role)],
    });
  }

  it('refuses role-insufficient without edit on the archived list, and restores nothing', async () => {
    const spaces = sprintShared('comment');

    const refusal = await refusalOf(
      new UnarchiveList(spaces, atelierNordMembers()).execute(
        unarchiveSprint({ expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: 'comment' });
    expect(spaces.lists.get(SPRINT_14)?.archivedAt).toEqual(ARCHIVED_AT);
    expect(spaces.events).toEqual([]);
  });

  it('refuses a stale If-Match with the stored version', async () => {
    const refusal = await refusalOf(
      new UnarchiveList(sprintShared('edit'), atelierNordMembers()).execute(
        unarchiveSprint({ expectedVersions: [3] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 4 });
  });

  it('answers list-not-found for an archived list of a private space of another', async () => {
    const refusal = await refusalOf(
      new UnarchiveList(atelierNord(), atelierNordMembers()).execute(
        unarchiveSprint({ listId: MAQUETTES }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers list-not-found for a list that does not exist', async () => {
    const refusal = await refusalOf(
      new UnarchiveList(atelierNord(), atelierNordMembers()).execute(
        unarchiveSprint({ listId: UNKNOWN_LIST }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new UnarchiveList(atelierNord(), atelierNordMembers()).execute(
        unarchiveSprint({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });

  it('locks the membership of the actor for share before the list', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    await new UnarchiveList(spaces, members).execute(unarchiveSprint());

    expect(spaces.journal).toEqual([`membership ${LEA}`, `list ${SPRINT_14}`]);
  });
});
