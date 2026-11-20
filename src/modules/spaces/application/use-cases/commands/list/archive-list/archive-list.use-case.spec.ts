import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  InMemorySpaces,
  LEA,
  NADIA,
  OTHER_ORGANIZATION,
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
import type { ArchiveListInput } from './archive-list.input.js';
import { ArchiveList } from './archive-list.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Builds the archive of Sprint 14 by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function archiveSprint(overrides: Partial<ArchiveListInput> = {}): ArchiveListInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    listId: SPRINT_14,
    expectedVersions: null,
    ...overrides,
  };
}

/** Atelier Nord: Backlog and Sprint 14 (version 3) in "Produit", "Maquettes" in the private "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      backlogState(),
      sprintState({ version: 3 }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
  });
}

describe('ArchiveList: a member with edit on the list archives it', () => {
  it('stores the archive at the instant of the transaction, by the actor, at the next version', async () => {
    const spaces = atelierNord();

    const view = await new ArchiveList(spaces, atelierNordMembers()).execute(archiveSprint());

    const archived = sprintState({
      archivedAt: TRANSACTION_INSTANT,
      archivedBy: { type: 'user', id: LEA },
      version: 4,
    });
    expect(view).toEqual({ list: archived, callerRole: 'edit' });
    expect(spaces.lists.get(SPRINT_14)).toEqual(archived);
  });

  it('appends list.archived with the version and the instant of the archive, by the actor', async () => {
    const spaces = atelierNord();

    await new ArchiveList(spaces, atelierNordMembers()).execute(archiveSprint());

    expect(spaces.events).toEqual([
      {
        kind: 'listArchived',
        listId: SPRINT_14,
        version: 4,
        archivedAt: TRANSACTION_INSTANT,
        actor: { type: 'user', id: LEA },
      },
    ]);
  });

  it('leaves the other lists as they were', async () => {
    const spaces = atelierNord();

    await new ArchiveList(spaces, atelierNordMembers()).execute(archiveSprint());

    expect(spaces.lists.get(backlogState().id)).toEqual(backlogState());
  });

  it('lets the owner of a private space archive its lists', async () => {
    const { list } = await new ArchiveList(atelierNord(), atelierNordMembers()).execute(
      archiveSprint({ actorUserId: HUGO, listId: MAQUETTES }),
    );

    expect(list.archivedBy).toEqual({ type: 'user', id: HUGO });
  });
});

describe('ArchiveList: a list archived already answers the same version and emits nothing', () => {
  it('keeps the archive, the version and the outbox as they were', async () => {
    const archived = sprintState({
      archivedAt: ARCHIVED_AT,
      archivedBy: { type: 'user', id: CAMILLE },
      version: 4,
    });
    const spaces = new InMemorySpaces({ spaces: [spaceState()], lists: [archived] });

    const view = await new ArchiveList(spaces, atelierNordMembers()).execute(archiveSprint());

    expect(view).toEqual({ list: archived, callerRole: 'edit' });
    expect(spaces.lists.get(SPRINT_14)).toEqual(archived);
    expect(spaces.events).toEqual([]);
  });

  it('is repeatable: archiving twice appends one event only', async () => {
    const spaces = atelierNord();
    const archive = new ArchiveList(spaces, atelierNordMembers());

    await archive.execute(archiveSprint());
    const again = await archive.execute(archiveSprint());

    expect(again.list.version).toBe(4);
    expect(spaces.events).toHaveLength(1);
  });

  it('checks If-Match before answering that it is archived already', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState({
          archivedAt: ARCHIVED_AT,
          archivedBy: { type: 'user', id: CAMILLE },
          version: 4,
        }),
      ],
    });

    const refusal = await refusalOf(
      new ArchiveList(spaces, atelierNordMembers()).execute(
        archiveSprint({ expectedVersions: [3] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 4 });
  });
});

describe('ArchiveList: the refusals come in the order 404, 403, 412', () => {
  /**
   * Atelier Nord with Sprint 14 (version 3), its switch off, shared with Léa Petit.
   *
   * @param role - The role of the grant of Léa Petit on Sprint 14.
   * @returns The fake store.
   */
  function sprintShared(role: 'edit' | 'comment' | 'view'): InMemorySpaces {
    return new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ version: 3, organizationAccess: false })],
      grants: [listGrantOf(PRODUIT, SPRINT_14, LEA, role)],
    });
  }

  it.each([['comment'], ['view']] as const)(
    'refuses role-insufficient with the role %s, and stores nothing',
    async (role: 'comment' | 'view') => {
      const spaces = sprintShared(role);

      const refusal = await refusalOf(
        new ArchiveList(spaces, atelierNordMembers()).execute(archiveSprint()),
      );

      expect(refusal).toEqual({ reason: 'role-insufficient', role });
      expect(spaces.lists.get(SPRINT_14)?.archivedAt).toBeNull();
      expect(spaces.events).toEqual([]);
    },
  );

  it('answers role-insufficient before a stale If-Match', async () => {
    const refusal = await refusalOf(
      new ArchiveList(sprintShared('view'), atelierNordMembers()).execute(
        archiveSprint({ expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('refuses a stale If-Match with the stored version, and stores nothing', async () => {
    const spaces = sprintShared('edit');

    const refusal = await refusalOf(
      new ArchiveList(spaces, atelierNordMembers()).execute(
        archiveSprint({ expectedVersions: [2] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 3 });
    expect(spaces.events).toEqual([]);
  });

  it('archives when the stored version is one of the versions sent', async () => {
    const { list } = await new ArchiveList(sprintShared('edit'), atelierNordMembers()).execute(
      archiveSprint({ expectedVersions: [2, 3] }),
    );

    expect(list.version).toBe(4);
  });

  it.each([
    ['a list of a private space of another', { actorUserId: CAMILLE, listId: MAQUETTES }],
    ['a list that does not exist', { listId: UNKNOWN_LIST }],
    ['a list a guest has no grant of', { actorUserId: NADIA }],
  ])(
    'answers list-not-found for %s',
    async (_why: string, overrides: Partial<ArchiveListInput>) => {
      const spaces = atelierNord();

      const refusal = await refusalOf(
        new ArchiveList(spaces, atelierNordMembers()).execute(archiveSprint(overrides)),
      );

      expect(refusal).toEqual({ reason: 'list-not-found' });
      expect(spaces.events).toEqual([]);
    },
  );

  it('answers list-not-found for a list of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [sprintState({ organizationId: OTHER_ORGANIZATION })],
    });

    const refusal = await refusalOf(
      new ArchiveList(spaces, atelierNordMembers()).execute(archiveSprint()),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new ArchiveList(atelierNord(), atelierNordMembers()).execute(
        archiveSprint({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('ArchiveList: the membership is read for share, then the list is locked', () => {
  it('locks the membership of the actor, then holds the space for share before the list', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    await new ArchiveList(spaces, members).execute(archiveSprint());

    expect(spaces.journal).toEqual([
      `membership ${LEA}`,
      `space ${PRODUIT} share`,
      `list ${SPRINT_14}`,
    ]);
  });
});
