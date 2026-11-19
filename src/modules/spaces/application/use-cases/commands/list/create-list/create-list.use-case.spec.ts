import { describe, expect, it } from 'vitest';

import { InvalidListError } from '../../../../../domain/errors/list/invalid-list.error.js';
import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14_GOAL,
  STRANGER,
  UNKNOWN_SPACE,
  atelierNordMembers,
  backlogState,
  designState,
  listGrantOf,
  refusalOf,
  spaceGrantOf,
  spaceState,
} from '../../../spaces.fixture.js';
import type { CreateListInput } from './create-list.input.js';
import { CreateList } from './create-list.use-case.js';

/**
 * Builds the creation of the list "Backlog" in "Produit" by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function createBacklog(overrides: Partial<CreateListInput> = {}): CreateListInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    spaceId: PRODUIT,
    name: 'Backlog',
    icon: null,
    color: 'gris',
    sprint: null,
    organizationAccess: true,
    ...overrides,
  };
}

/**
 * Builds the creation of Sprint 14 in "Produit" by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function createSprint(overrides: Partial<CreateListInput> = {}): CreateListInput {
  return createBacklog({
    name: 'Sprint 14',
    color: 'indigo',
    sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: SPRINT_14_GOAL },
    ...overrides,
  });
}

/** Atelier Nord with "Produit" and the private "Design" (Hugo Dubois). */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({ spaces: [spaceState(), designState()] });
}

describe('CreateList: a member with edit on the space creates a list in it', () => {
  it('stores the list at version 1 and returns it', async () => {
    const spaces = atelierNord();

    const { list } = await new CreateList(spaces, atelierNordMembers()).execute(createBacklog());

    expect(list).toMatchObject({
      organizationId: ATELIER_NORD,
      spaceId: PRODUIT,
      name: 'Backlog',
      icon: null,
      color: 'gris',
      sprint: null,
      organizationAccess: true,
      version: 1,
    });
    expect(spaces.lists.get(list.id)).toEqual(list);
  });

  it('appends list.created by the caller, in the same transaction', async () => {
    const spaces = atelierNord();

    const { list } = await new CreateList(spaces, atelierNordMembers()).execute(createBacklog());

    expect(spaces.events).toEqual([
      { kind: 'listCreated', listId: list.id, spaceId: PRODUIT, actor: { type: 'user', id: LEA } },
    ]);
    expect(spaces.runs).toBe(1);
  });

  it('stores the name the domain trims', async () => {
    const { list } = await new CreateList(atelierNord(), atelierNordMembers()).execute(
      createBacklog({ name: '  Backlog ' }),
    );

    expect(list.name).toBe('Backlog');
  });

  it('lets the owner of the space create a list in its private space', async () => {
    const { list } = await new CreateList(atelierNord(), atelierNordMembers()).execute(
      createBacklog({ actorUserId: HUGO, spaceId: DESIGN }),
    );

    expect(list.spaceId).toBe(DESIGN);
  });

  it('rejects an empty name as an invalid list and stores nothing', async () => {
    const spaces = atelierNord();

    await expect(
      new CreateList(spaces, atelierNordMembers()).execute(createBacklog({ name: '   ' })),
    ).rejects.toThrow(InvalidListError);

    expect(spaces.lists.size).toBe(0);
    expect(spaces.events).toEqual([]);
  });
});

describe('CreateList: a sprint has dates, a goal, and ends on or after its first day', () => {
  it('creates Sprint 14 from 3 to 17 November with its goal', async () => {
    const spaces = atelierNord();

    const { list } = await new CreateList(spaces, atelierNordMembers()).execute(createSprint());

    expect(list.sprint).toEqual({
      startDate: '2026-11-03',
      endDate: '2026-11-17',
      goal: SPRINT_14_GOAL,
    });
    expect(spaces.events.map((event) => event.kind)).toEqual(['listCreated']);
  });

  it('allows a sprint of a single day, with no goal', async () => {
    const { list } = await new CreateList(atelierNord(), atelierNordMembers()).execute(
      createSprint({ sprint: { startDate: '2026-11-03', endDate: '2026-11-03' } }),
    );

    expect(list.sprint).toEqual({ startDate: '2026-11-03', endDate: '2026-11-03', goal: null });
  });

  it('refuses an end before the start with sprint-dates-invalid and stores nothing', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new CreateList(spaces, atelierNordMembers()).execute(
        createSprint({ sprint: { startDate: '2026-11-17', endDate: '2026-11-03' } }),
      ),
    );

    expect(refusal).toEqual({ reason: 'sprint-dates-invalid' });
    expect(spaces.lists.size).toBe(0);
    expect(spaces.events).toEqual([]);
  });

  it('rejects an impossible date as an invalid list, not as sprint-dates-invalid', async () => {
    await expect(
      new CreateList(atelierNord(), atelierNordMembers()).execute(
        createSprint({ sprint: { startDate: '2026-02-30', endDate: '2026-03-10' } }),
      ),
    ).rejects.toThrow(InvalidListError);
  });
});

describe('CreateList: a space the caller does not see answers as an unknown one does', () => {
  it.each([
    ['the owner of the organization', CAMILLE],
    ['an admin', INES],
    ['another member', LEA],
  ])('hides the private Design from %s', async (_who: string, actorUserId: string) => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new CreateList(spaces, atelierNordMembers()).execute(
        createBacklog({ actorUserId, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
    expect(spaces.lists.size).toBe(0);
    expect(spaces.events).toEqual([]);
  });

  it('refuses a guest, who sees no space', async () => {
    const refusal = await refusalOf(
      new CreateList(atelierNord(), atelierNordMembers()).execute(
        createBacklog({ actorUserId: NADIA }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('refuses a space that does not exist', async () => {
    const refusal = await refusalOf(
      new CreateList(atelierNord(), atelierNordMembers()).execute(
        createBacklog({ spaceId: UNKNOWN_SPACE }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('refuses a space of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
    });

    const refusal = await refusalOf(
      new CreateList(spaces, atelierNordMembers()).execute(createBacklog()),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new CreateList(atelierNord(), atelierNordMembers()).execute(
        createBacklog({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('CreateList: the membership of the caller is locked, so a removal cannot slip in', () => {
  it('asks the directory for the role of the caller with the lock', async () => {
    const members = atelierNordMembers();

    await new CreateList(atelierNord(), members).execute(createBacklog());

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: LEA, lock: true }]);
  });
});

describe('CreateList: a list is created in a space the caller has edit on', () => {
  /** A list of the private space "Design". */
  const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

  /**
   * The private Design, shared with Léa Petit with the role given, and its list Maquettes shared
   * with the guest Nadia Benali.
   *
   * @param role - The role of the grant of Léa Petit.
   * @returns The fake store.
   */
  function designSharedWithLea(role: 'edit' | 'comment' | 'view'): InMemorySpaces {
    return new InMemorySpaces({
      spaces: [designState()],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' })],
      grants: [spaceGrantOf(DESIGN, LEA, role), listGrantOf(DESIGN, MAQUETTES, NADIA, 'edit')],
    });
  }

  it('answers edit for the new list, without reading grants in a space of the organization', async () => {
    const spaces = atelierNord();

    const created = await new CreateList(spaces, atelierNordMembers()).execute(createBacklog());

    expect(created.callerRole).toBe('edit');
    expect(created.list.organizationAccess).toBe(true);
    expect(spaces.viewerGrantsCalls).toEqual([]);
  });

  it('stores the switch "Accès de l’organisation" off when asked, answering the role it was created with', async () => {
    const spaces = atelierNord();

    const created = await new CreateList(spaces, atelierNordMembers()).execute(
      createBacklog({ organizationAccess: false }),
    );

    expect(created.callerRole).toBe('edit');
    expect(spaces.lists.get(created.list.id)?.organizationAccess).toBe(false);
  });

  it('lets a member with edit on a private space through its grant create a list in it', async () => {
    const created = await new CreateList(designSharedWithLea('edit'), atelierNordMembers()).execute(
      createBacklog({ spaceId: DESIGN }),
    );

    expect(created.list.spaceId).toBe(DESIGN);
  });

  it.each([['comment'], ['view']] as const)(
    'refuses role-insufficient with the role %s on the space, and stores nothing',
    async (role: 'comment' | 'view') => {
      const spaces = designSharedWithLea(role);

      const refusal = await refusalOf(
        new CreateList(spaces, atelierNordMembers()).execute(createBacklog({ spaceId: DESIGN })),
      );

      expect(refusal).toEqual({ reason: 'role-insufficient', role });
      expect(spaces.lists.size).toBe(1);
      expect(spaces.events).toEqual([]);
    },
  );

  it('refuses role-insufficient with no role to a guest who sees the space through a list', async () => {
    const refusal = await refusalOf(
      new CreateList(designSharedWithLea('view'), atelierNordMembers()).execute(
        createBacklog({ actorUserId: NADIA, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: null });
  });

  it('answers space-not-found, not role-insufficient, to a member who does not see the space', async () => {
    const refusal = await refusalOf(
      new CreateList(designSharedWithLea('view'), atelierNordMembers()).execute(
        createBacklog({ actorUserId: INES, spaceId: DESIGN }),
      ),
    );

    expect(refusal).toEqual({ reason: 'space-not-found' });
  });
});
