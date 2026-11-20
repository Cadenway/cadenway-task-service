import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
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
  TRASH_WRITES_OFF,
  TRASH_WRITES_ON,
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
import { GrantRequestedAccess } from '../../access/grant-requested-access/grant-requested-access.use-case.js';
import { CheckListAccess } from '../../../queries/access/check-list-access/check-list-access.use-case.js';
import { FindAccessTarget } from '../../../queries/access/find-access-target/find-access-target.use-case.js';
import { FindVisibleList } from '../../../queries/list/find-visible-list/find-visible-list.use-case.js';
import { GetList } from '../../../queries/list/get-list/get-list.use-case.js';
import { ListLists } from '../../../queries/list/list-lists/list-lists.use-case.js';
import { ListVisibleListIds } from '../../../queries/list/list-visible-list-ids/list-visible-list-ids.use-case.js';
import { GetSpace } from '../../../queries/space/get-space/get-space.use-case.js';
import { RestoreArchivedList } from '../restore-archived-list/restore-archived-list.use-case.js';
import type { DeleteListInput } from './delete-list.input.js';
import { DeleteList } from './delete-list.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Builds the deletion of Sprint 14 by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function deleteSprint(overrides: Partial<DeleteListInput> = {}): DeleteListInput {
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

describe('DeleteList: a member with edit on the list deletes it ("Supprimer la liste")', () => {
  it('permanently removes views in the deletion transaction and retains list favorites', async () => {
    const spaces = atelierNord();

    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint());

    expect(spaces.libraryCleanupCalls).toEqual([
      { operation: 'views', organizationId: ATELIER_NORD, targetIds: [SPRINT_14] },
    ]);
  });

  it('rolls the tombstone, event and job back when view cleanup fails', async () => {
    const spaces = atelierNord();
    spaces.libraryCleanupError = new Error('cleanup failed');

    await expect(
      new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint()),
    ).rejects.toThrow('cleanup failed');

    expect(spaces.lists.get(SPRINT_14)).toEqual(sprintState({ version: 3 }));
    expect(spaces.events).toEqual([]);
    expect(spaces.jobs).toEqual([]);
    expect(spaces.libraryCleanupCalls).toEqual([]);
  });

  it('makes a tombstone at the instant of the transaction, by the actor, at the next version', async () => {
    const spaces = atelierNord();

    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint());

    expect(spaces.lists.get(SPRINT_14)).toEqual(
      sprintState({
        deletedAt: TRANSACTION_INSTANT,
        deletedBy: { type: 'user', id: LEA },
        version: 4,
      }),
    );
  });

  it('appends list.deleted with its version and space, by the actor', async () => {
    const spaces = atelierNord();

    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint());

    expect(spaces.events).toEqual([
      {
        kind: 'listDeleted',
        listId: SPRINT_14,
        spaceId: PRODUIT,
        version: 4,
        deletedAt: TRANSACTION_INSTANT,
        actor: { type: 'user', id: LEA },
      },
    ]);
  });

  it('enqueues the job that moves its tasks to the trash, keyed by the list and its version after', async () => {
    const spaces = atelierNord();

    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint());

    expect(spaces.jobs).toEqual([
      { payload: { listId: SPRINT_14 }, occurrenceKey: `list:${SPRINT_14}:4` },
    ]);
  });

  it('deletes an archived list, its archive kept in the tombstone', async () => {
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

    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint());

    expect(spaces.lists.get(SPRINT_14)).toMatchObject({
      archivedAt: ARCHIVED_AT,
      deletedAt: TRANSACTION_INSTANT,
      version: 5,
    });
  });

  it('keeps the grants of the list with the tombstone, and leaves the other lists as they were', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), sprintState({ version: 3 })],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'view')],
    });

    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint());

    expect(spaces.grantsOf({ kind: 'list', spaceId: PRODUIT, listId: SPRINT_14 })).toEqual([
      { userId: NADIA, role: 'view' },
    ]);
    expect(spaces.lists.get(BACKLOG)).toEqual(backlogState());
  });

  it('lets the owner of a private space delete its lists', async () => {
    const spaces = atelierNord();

    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
      deleteSprint({ actorUserId: HUGO, listId: MAQUETTES }),
    );

    expect(spaces.lists.get(MAQUETTES)?.deletedBy).toEqual({ type: 'user', id: HUGO });
  });
});

describe('DeleteList: the refusals come in the order 404, 403, 412 and write nothing', () => {
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
    'refuses role-insufficient with the role %s',
    async (role: 'comment' | 'view') => {
      const spaces = sprintShared(role);

      const refusal = await refusalOf(
        new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint()),
      );

      expect(refusal).toEqual({ reason: 'role-insufficient', role });
      expect(spaces.lists.get(SPRINT_14)?.deletedAt).toBeNull();
      expect(spaces.events).toEqual([]);
      expect(spaces.jobs).toEqual([]);
    },
  );

  it('answers role-insufficient before a stale If-Match', async () => {
    const refusal = await refusalOf(
      new DeleteList(sprintShared('view'), atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteSprint({ expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('refuses a stale If-Match with the stored version', async () => {
    const spaces = sprintShared('edit');

    const refusal = await refusalOf(
      new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteSprint({ expectedVersions: [2] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 3 });
    expect(spaces.jobs).toEqual([]);
  });

  it('deletes when the stored version is one of the versions sent', async () => {
    const spaces = sprintShared('edit');

    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
      deleteSprint({ expectedVersions: [2, 3] }),
    );

    expect(spaces.lists.get(SPRINT_14)?.version).toBe(4);
  });

  it.each([
    ['a list of a private space of another', { actorUserId: CAMILLE, listId: MAQUETTES }],
    ['a list that does not exist', { listId: UNKNOWN_LIST }],
    ['a list a guest has no grant of', { actorUserId: NADIA }],
  ])('answers list-not-found for %s', async (_why: string, overrides: Partial<DeleteListInput>) => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteSprint(overrides),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
    expect(spaces.events).toEqual([]);
  });

  it('answers list-not-found for a list deleted already, and enqueues nothing more', async () => {
    const spaces = atelierNord();
    const deletion = new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON);
    await deletion.execute(deleteSprint());

    const refusal = await refusalOf(deletion.execute(deleteSprint()));

    expect(refusal).toEqual({ reason: 'list-not-found' });
    expect(spaces.events).toHaveLength(1);
    expect(spaces.jobs).toHaveLength(1);
  });

  it('answers list-not-found for a list of a deleted space', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ deletedAt: ARCHIVED_AT, deletedBy: { type: 'user', id: CAMILLE } })],
      lists: [sprintState({ version: 3 })],
    });

    const refusal = await refusalOf(
      new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint()),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers list-not-found for a list of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [sprintState({ organizationId: OTHER_ORGANIZATION })],
    });

    const refusal = await refusalOf(
      new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint()),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new DeleteList(atelierNord(), atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteSprint({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('DeleteList: the membership is read for share, then the list is locked', () => {
  it('locks the membership of the actor, then holds the space for share before the list', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    await new DeleteList(spaces, members, TRASH_WRITES_ON).execute(deleteSprint());

    expect(spaces.journal).toEqual([
      `membership ${LEA}`,
      `space ${PRODUIT} share`,
      `list ${SPRINT_14}`,
    ]);
  });
});

describe('DeleteList: a deleted list is invisible everywhere (a tombstone answers 404)', () => {
  /**
   * Atelier Nord after Léa Petit deleted Sprint 14, shared with Nadia Benali before.
   *
   * @returns The fake store.
   */
  async function afterDeletion(): Promise<InMemorySpaces> {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [backlogState(), sprintState({ version: 3 })],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit')],
    });
    await new DeleteList(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteSprint());
    return spaces;
  }

  it('answers list-not-found to a reading by id and to the access check', async () => {
    const spaces = await afterDeletion();
    const members = atelierNordMembers();

    expect(
      await refusalOf(
        new GetList(spaces, members).execute({
          organizationId: ATELIER_NORD,
          actorUserId: CAMILLE,
          listId: SPRINT_14,
        }),
      ),
    ).toEqual({ reason: 'list-not-found' });
    expect(
      await refusalOf(
        new CheckListAccess(spaces, members).execute({
          organizationId: ATELIER_NORD,
          actorUserId: CAMILLE,
          listId: SPRINT_14,
        }),
      ),
    ).toEqual({ reason: 'list-not-found' });
  });

  it('leaves it out of the lists of its space and of the lists the tasks module reads', async () => {
    const spaces = await afterDeletion();

    const page = await new ListLists(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      spaceId: PRODUIT,
      after: null,
      limit: 50,
    });
    const ids = await new ListVisibleListIds(spaces).execute({
      organizationId: ATELIER_NORD,
      viewerUserId: CAMILLE,
      viewerRole: 'owner',
    });
    const found = await new FindVisibleList(spaces).execute({
      organizationId: ATELIER_NORD,
      viewerUserId: CAMILLE,
      viewerRole: 'owner',
      listId: SPRINT_14,
    });

    expect(page.items.map((view) => view.list.id)).toEqual([BACKLOG]);
    expect(ids.listIds).toEqual([BACKLOG]);
    expect(found).toBeNull();
  });

  it('answers no access target, refuses an approved request and a restoration from the archives', async () => {
    const spaces = await afterDeletion();

    const target = await new FindAccessTarget(spaces).execute({
      organizationId: ATELIER_NORD,
      viewerUserId: CAMILLE,
      viewerRole: 'owner',
      target: { kind: 'list', listId: SPRINT_14 },
    });
    const granted = await new GrantRequestedAccess(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      actorRole: 'owner',
      target: { kind: 'list', listId: SPRINT_14 },
      granteeUserId: HUGO,
      role: 'edit',
    });
    const restored = await new RestoreArchivedList(spaces).execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      viewerRole: 'owner',
      listId: SPRINT_14,
    });

    expect(target).toBeNull();
    expect(granted).toEqual({ outcome: 'refused', reason: 'not-found' });
    expect(restored).toEqual({ outcome: 'not-found' });
  });

  it('no longer shows its space to a guest through the grant of the deleted list', async () => {
    const spaces = await afterDeletion();

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute({
        organizationId: ATELIER_NORD,
        actorUserId: NADIA,
        spaceId: PRODUIT,
      }),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });
});

describe('DeleteList: the route answers as an unknown one while the writes of the trash are off', () => {
  it('refuses trash-writes-disabled before reading the membership, and writes nothing', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    const refusal = await refusalOf(
      new DeleteList(spaces, members, TRASH_WRITES_OFF).execute(deleteSprint()),
    );

    expect(refusal).toEqual({ reason: 'trash-writes-disabled' });
    expect(spaces.runs).toBe(0);
    expect(spaces.journal).toEqual([]);
    expect(spaces.events).toEqual([]);
    expect(spaces.jobs).toEqual([]);
  });

  it('answers it even to an actor the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new DeleteList(atelierNord(), atelierNordMembers(), TRASH_WRITES_OFF).execute(
        deleteSprint({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'trash-writes-disabled' });
  });
});
