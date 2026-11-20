import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DELETED_AT,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  MARKETING,
  NADIA,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  TRASH_WRITES_OFF,
  TRASH_WRITES_ON,
  TRANSACTION_INSTANT,
  UNKNOWN_SPACE,
  atelierNordMembers,
  backlogState,
  designState,
  listGrantOf,
  marketingState,
  refusalOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { CreateSpace } from '../create-space/create-space.use-case.js';
import { GetSpace } from '../../../queries/space/get-space/get-space.use-case.js';
import { ListSpaces } from '../../../queries/space/list-spaces/list-spaces.use-case.js';
import { ListSidebarLists } from '../../../queries/list/list-sidebar-lists/list-sidebar-lists.use-case.js';
import { ListManagedAccessTargets } from '../../../queries/access/list-managed-access-targets/list-managed-access-targets.use-case.js';
import type { DeleteSpaceInput } from './delete-space.input.js';
import { DeleteSpace } from './delete-space.use-case.js';

/**
 * Builds the deletion of "Produit" by Camille Martin, the owner of Atelier Nord.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function deleteProduit(overrides: Partial<DeleteSpaceInput> = {}): DeleteSpaceInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    spaceId: PRODUIT,
    expectedVersions: null,
    ...overrides,
  };
}

/** Atelier Nord: "Produit" (version 5) with Backlog and Sprint 14, the private "Design", "Marketing". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState({ version: 5 }), designState(), marketingState()],
    lists: [backlogState({ version: 2 }), sprintState({ version: 3 })],
  });
}

describe('DeleteSpace: who manages a space deletes it with its lists ("Supprimer l’espace")', () => {
  it('makes a tombstone of the space at the instant of the transaction, by the actor, at the next version', async () => {
    const spaces = atelierNord();

    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    expect(spaces.spaces.get(PRODUIT)).toEqual(
      spaceState({
        deletedAt: TRANSACTION_INSTANT,
        deletedBy: { type: 'user', id: CAMILLE },
        version: 6,
      }),
    );
  });

  it('makes a tombstone of each of its lists at the same instant and actor, each at its own version', async () => {
    const spaces = atelierNord();

    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    expect(spaces.lists.get(BACKLOG)).toEqual(
      backlogState({
        deletedAt: TRANSACTION_INSTANT,
        deletedBy: { type: 'user', id: CAMILLE },
        version: 2,
      }),
    );
    expect(spaces.lists.get(SPRINT_14)).toMatchObject({
      deletedAt: TRANSACTION_INSTANT,
      deletedBy: { type: 'user', id: CAMILLE },
      version: 3,
    });
  });

  it('deletes its archived lists too, and keeps the tombstone of a list deleted on its own before', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        backlogState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: LEA }, version: 2 }),
        sprintState({ archivedAt: ARCHIVED_AT, archivedBy: { type: 'user', id: LEA } }),
      ],
    });

    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    expect(spaces.lists.get(BACKLOG)).toMatchObject({
      deletedAt: DELETED_AT,
      deletedBy: { type: 'user', id: LEA },
      version: 2,
    });
    expect(spaces.lists.get(SPRINT_14)).toMatchObject({
      archivedAt: ARCHIVED_AT,
      deletedAt: TRANSACTION_INSTANT,
    });
  });

  it('appends space.deleted alone, no list.deleted for its lists', async () => {
    const spaces = atelierNord();

    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    expect(spaces.events).toEqual([
      {
        kind: 'spaceDeleted',
        spaceId: PRODUIT,
        version: 6,
        deletedAt: TRANSACTION_INSTANT,
        actor: { type: 'user', id: CAMILLE },
      },
    ]);
  });

  it('enqueues the job that moves its tasks to the trash, keyed by the space and its version after', async () => {
    const spaces = atelierNord();

    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    expect(spaces.jobs).toEqual([
      { payload: { spaceId: PRODUIT }, occurrenceKey: `space:${PRODUIT}:6` },
    ]);
  });

  it('leaves the other spaces and their lists as they were, and keeps the grants', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ version: 5 }), marketingState()],
      lists: [sprintState(), backlogState({ spaceId: MARKETING })],
      grants: [spaceGrantOf(PRODUIT, LEA, 'view'), listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit')],
    });

    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    expect(spaces.spaces.get(MARKETING)).toEqual(marketingState());
    expect(spaces.lists.get(BACKLOG)?.deletedAt).toBeNull();
    expect(spaces.grants).toHaveLength(2);
  });

  it.each([
    ['its owner', HUGO, DESIGN],
    ['an admin of the organization, for a space of the organization', INES, PRODUIT],
  ])('lets %s delete it', async (_who: string, actorUserId: string, spaceId: string) => {
    const spaces = atelierNord();

    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
      deleteProduit({ actorUserId, spaceId }),
    );

    expect(spaces.spaces.get(spaceId)?.deletedBy).toEqual({ type: 'user', id: actorUserId });
  });
});

describe('DeleteSpace: the refusals come in the order 404, 403 space.manage-forbidden, 412', () => {
  it('refuses manage-forbidden to a member with edit who does not manage the space', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteProduit({ actorUserId: LEA }),
      ),
    );

    expect(refusal).toEqual({ reason: 'manage-forbidden' });
    expect(spaces.spaces.get(PRODUIT)?.deletedAt).toBeNull();
    expect(spaces.lists.get(SPRINT_14)?.deletedAt).toBeNull();
    expect(spaces.events).toEqual([]);
    expect(spaces.jobs).toEqual([]);
  });

  it('refuses manage-forbidden to a guest who sees the space through a list, before If-Match', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ version: 5 })],
      lists: [sprintState()],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit')],
    });

    const refusal = await refusalOf(
      new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteProduit({ actorUserId: NADIA, expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'manage-forbidden' });
  });

  it('refuses a stale If-Match with the stored version, and writes nothing', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteProduit({ expectedVersions: [4] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 5 });
    expect(spaces.lists.get(BACKLOG)?.deletedAt).toBeNull();
    expect(spaces.jobs).toEqual([]);
  });

  it.each([
    ['a private space of another', { spaceId: DESIGN }],
    ['a space that does not exist', { spaceId: UNKNOWN_SPACE }],
  ])(
    'answers space-not-found for %s',
    async (_why: string, overrides: Partial<DeleteSpaceInput>) => {
      const refusal = await refusalOf(
        new DeleteSpace(atelierNord(), atelierNordMembers(), TRASH_WRITES_ON).execute(
          deleteProduit(overrides),
        ),
      );

      expect(refusal).toEqual({ reason: 'space-not-found' });
    },
  );

  it('answers space-not-found for a space deleted already, and enqueues nothing more', async () => {
    const spaces = atelierNord();
    const deletion = new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON);
    await deletion.execute(deleteProduit());

    const refusal = await refusalOf(deletion.execute(deleteProduit()));

    expect(refusal).toEqual({ reason: 'space-not-found' });
    expect(spaces.jobs).toHaveLength(1);
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new DeleteSpace(atelierNord(), atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteProduit({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('DeleteSpace: the membership, then the space, then its lists', () => {
  it('locks the membership of the actor for share, then the space, then its lists in ascending id', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    await new DeleteSpace(spaces, members, TRASH_WRITES_ON).execute(deleteProduit());

    expect(spaces.journal).toEqual([
      `membership ${CAMILLE}`,
      `space ${PRODUIT}`,
      ...[BACKLOG, SPRINT_14].sort().map((id: string) => `list ${id}`),
    ]);
  });

  it('locks the lists of the space in ascending id whatever their order of creation, not the tombstones nor the lists of other spaces', async () => {
    /** "Recette", created first, with the highest id. */
    const RECETTE = '019a7100-0000-7000-8000-0000000000fe';
    const spaces = new InMemorySpaces({
      spaces: [spaceState(), marketingState()],
      lists: [
        backlogState({ id: RECETTE, name: 'Recette', createdAt: new Date('2026-09-01T08:00:00Z') }),
        sprintState(),
        backlogState({ deletedAt: DELETED_AT, deletedBy: { type: 'user', id: LEA } }),
        backlogState({ id: '019a7100-0000-7000-8000-000000000000', spaceId: MARKETING }),
      ],
    });

    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    expect(spaces.journal).toEqual([
      `space ${PRODUIT}`,
      ...[SPRINT_14, RECETTE].sort().map((id: string) => `list ${id}`),
    ]);
    expect(spaces.lists.get(RECETTE)?.deletedAt).toEqual(TRANSACTION_INSTANT);
  });

  it('locks no list when the refusal comes from the space', async () => {
    const spaces = atelierNord();

    await refusalOf(
      new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(
        deleteProduit({ actorUserId: LEA }),
      ),
    );

    expect(spaces.journal.filter((entry: string) => entry.startsWith('list '))).toEqual([]);
  });
});

describe('DeleteSpace: a deleted space is invisible everywhere, and its prefix stays reserved', () => {
  it('answers space-not-found by id and leaves it out of the spaces, the sidebar and the managed targets', async () => {
    const spaces = atelierNord();
    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    const refusal = await refusalOf(
      new GetSpace(spaces, atelierNordMembers()).execute({
        organizationId: ATELIER_NORD,
        actorUserId: CAMILLE,
        spaceId: PRODUIT,
      }),
    );
    const page = await new ListSpaces(spaces, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      after: null,
      limit: 50,
    });
    const sidebar = await new ListSidebarLists(spaces).execute({
      organizationId: ATELIER_NORD,
      viewerUserId: CAMILLE,
      viewerRole: 'owner',
      limit: 6,
    });
    const managed = await new ListManagedAccessTargets(spaces).execute({
      organizationId: ATELIER_NORD,
      viewerUserId: CAMILLE,
      viewerRole: 'owner',
    });

    expect(refusal).toEqual({ reason: 'space-not-found' });
    expect(page.items.map((view) => view.space.id)).toEqual([MARKETING]);
    expect(sidebar.lists).toEqual([]);
    expect(managed.spaceIds).toEqual([MARKETING]);
    expect(managed.listIds).toEqual([]);
  });

  it('keeps its prefix reserved for another space', async () => {
    const spaces = atelierNord();
    await new DeleteSpace(spaces, atelierNordMembers(), TRASH_WRITES_ON).execute(deleteProduit());

    const refusal = await refusalOf(
      new CreateSpace(spaces, atelierNordMembers()).execute({
        organizationId: ATELIER_NORD,
        actorUserId: INES,
        name: 'Produit 2',
        prefix: 'CAD',
        description: null,
        icon: null,
        color: 'violet',
        visibility: 'organization',
      }),
    );

    expect(refusal).toEqual({ reason: 'prefix-taken', prefix: 'CAD' });
  });
});

describe('DeleteSpace: the route answers as an unknown one while the writes of the trash are off', () => {
  it('refuses trash-writes-disabled before reading the membership, and writes nothing', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    const refusal = await refusalOf(
      new DeleteSpace(spaces, members, TRASH_WRITES_OFF).execute(deleteProduit()),
    );

    expect(refusal).toEqual({ reason: 'trash-writes-disabled' });
    expect(spaces.runs).toBe(0);
    expect(spaces.journal).toEqual([]);
    expect(spaces.events).toEqual([]);
    expect(spaces.jobs).toEqual([]);
  });

  it('answers it even to an actor the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new DeleteSpace(atelierNord(), atelierNordMembers(), TRASH_WRITES_OFF).execute(
        deleteProduit({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'trash-writes-disabled' });
  });
});
