import { describe, expect, it } from 'vitest';

import { InvalidListError } from '../../../../../domain/errors/list/invalid-list.error.js';
import {
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  DESIGN,
  HUGO,
  INES,
  InMemorySpaces,
  LEA,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  SPRINT_14_GOAL,
  STRANGER,
  UNKNOWN_LIST,
  atelierNordMembers,
  backlogState,
  designState,
  listGrantOf,
  refusalOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { UpdateListInput } from './update-list.input.js';
import { UpdateList } from './update-list.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Builds a change of Sprint 14 by Léa Petit.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function updateSprint(overrides: Partial<UpdateListInput> = {}): UpdateListInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    listId: SPRINT_14,
    expectedVersions: null,
    patch: { name: 'Sprint 14 bis' },
    ...overrides,
  };
}

/** Atelier Nord: Backlog and Sprint 14 (version 2) in "Produit", "Maquettes" in the private "Design". */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      backlogState(),
      sprintState({ version: 2 }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
  });
}

describe('UpdateList: a member with edit on the list changes it', () => {
  it('stores the change at the next version and returns the list', async () => {
    const spaces = atelierNord();

    const view = await new UpdateList(spaces, atelierNordMembers()).execute(updateSprint());
    const { list } = view;

    expect(list).toEqual(sprintState({ name: 'Sprint 14 bis', version: 3 }));
    expect(view.callerRole).toBe('edit');
    expect(spaces.lists.get(SPRINT_14)).toEqual(list);
  });

  it('appends list.updated with what changed, by the caller', async () => {
    const spaces = atelierNord();

    await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({ patch: { name: 'Sprint 14 bis', color: 'vert' } }),
    );

    expect(spaces.events).toEqual([
      {
        kind: 'listUpdated',
        listId: SPRINT_14,
        version: 3,
        changed: ['name', 'color'],
        actor: { type: 'user', id: LEA },
      },
    ]);
  });

  it('lets the owner of a private space change its lists', async () => {
    const { list } = await new UpdateList(atelierNord(), atelierNordMembers()).execute(
      updateSprint({ actorUserId: HUGO, listId: MAQUETTES, patch: { name: 'Wireframes' } }),
    );

    expect(list.name).toBe('Wireframes');
  });

  it('rejects an empty name as an invalid list', async () => {
    const spaces = atelierNord();

    await expect(
      new UpdateList(spaces, atelierNordMembers()).execute(updateSprint({ patch: { name: ' ' } })),
    ).rejects.toThrow(InvalidListError);

    expect(spaces.events).toEqual([]);
  });
});

describe('UpdateList: a change that changes nothing stores nothing and emits nothing', () => {
  it('keeps the version and appends no event for an empty patch', async () => {
    const spaces = atelierNord();

    const view = await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({ patch: {} }),
    );

    expect(view.list).toEqual(sprintState({ version: 2 }));
    expect(view.callerRole).toBe('edit');
    expect(spaces.events).toEqual([]);
  });

  it('keeps the version when the patch sets the values the list has, goal left out', async () => {
    const spaces = atelierNord();

    await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({
        patch: { name: ' Sprint 14 ', sprint: { startDate: '2026-11-03', endDate: '2026-11-17' } },
      }),
    );

    expect(spaces.lists.get(SPRINT_14)?.version).toBe(2);
    expect(spaces.events).toEqual([]);
  });

  it('is repeatable: sending the same patch again appends one event only', async () => {
    const spaces = atelierNord();
    const update = new UpdateList(spaces, atelierNordMembers());

    await update.execute(updateSprint());
    await update.execute(updateSprint());

    expect(spaces.lists.get(SPRINT_14)?.version).toBe(3);
    expect(spaces.events).toHaveLength(1);
  });
});

describe('UpdateList: the dates and the goal of a sprint', () => {
  it('moves the dates and keeps the goal the patch leaves out', async () => {
    const spaces = atelierNord();

    const { list } = await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({ patch: { sprint: { startDate: '2026-11-04', endDate: '2026-11-18' } } }),
    );

    expect(list.sprint).toEqual({
      startDate: '2026-11-04',
      endDate: '2026-11-18',
      goal: SPRINT_14_GOAL,
    });
    expect(spaces.events).toMatchObject([{ kind: 'listUpdated', changed: ['sprint'] }]);
  });

  it('makes the sprint a list again with sprint: null, dropping its dates and goal', async () => {
    const spaces = atelierNord();

    const { list } = await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({ patch: { sprint: null } }),
    );

    expect(list.sprint).toBeNull();
    expect(spaces.events).toMatchObject([{ kind: 'listUpdated', changed: ['sprint'], version: 3 }]);
  });

  it('turns the list Backlog into a sprint with no goal', async () => {
    const { list } = await new UpdateList(atelierNord(), atelierNordMembers()).execute(
      updateSprint({
        listId: BACKLOG,
        patch: { sprint: { startDate: '2026-11-03', endDate: '2026-11-17' } },
      }),
    );

    expect(list.sprint).toEqual({ startDate: '2026-11-03', endDate: '2026-11-17', goal: null });
  });

  it('refuses an end before the start with sprint-dates-invalid and changes nothing', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new UpdateList(spaces, atelierNordMembers()).execute(
        updateSprint({
          patch: { name: 'Sprint 15', sprint: { startDate: '2026-11-17', endDate: '2026-11-03' } },
        }),
      ),
    );

    expect(refusal).toEqual({ reason: 'sprint-dates-invalid' });
    expect(spaces.lists.get(SPRINT_14)).toEqual(sprintState({ version: 2 }));
    expect(spaces.events).toEqual([]);
  });

  it('allows a sprint of a single day', async () => {
    const { list } = await new UpdateList(atelierNord(), atelierNordMembers()).execute(
      updateSprint({ patch: { sprint: { startDate: '2026-11-10', endDate: '2026-11-10' } } }),
    );

    expect(list.sprint).toMatchObject({ startDate: '2026-11-10', endDate: '2026-11-10' });
  });

  it('rejects an impossible date as an invalid list, not as sprint-dates-invalid', async () => {
    await expect(
      new UpdateList(atelierNord(), atelierNordMembers()).execute(
        updateSprint({ patch: { sprint: { startDate: '2026-11-03', endDate: '2026-11-31' } } }),
      ),
    ).rejects.toThrow(InvalidListError);
  });
});

describe('UpdateList: the version sent in If-Match is the stored version', () => {
  it('refuses a version that is not the stored one, answering the stored version', async () => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new UpdateList(spaces, atelierNordMembers()).execute(updateSprint({ expectedVersions: [1] })),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 2 });
    expect(spaces.lists.get(SPRINT_14)?.name).toBe('Sprint 14');
    expect(spaces.events).toEqual([]);
  });

  it('applies the change when the stored version is one of the versions sent', async () => {
    const spaces = atelierNord();

    await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({ expectedVersions: [1, 2] }),
    );

    expect(spaces.lists.get(SPRINT_14)?.version).toBe(3);
  });
});

describe('UpdateList: a list of a space the caller does not see answers as an unknown list does', () => {
  it.each([
    ['the owner of the organization', CAMILLE],
    ['an admin', INES],
    ['another member', LEA],
  ])('hides a list of the private Design from %s', async (_who: string, actorUserId: string) => {
    const spaces = atelierNord();

    const refusal = await refusalOf(
      new UpdateList(spaces, atelierNordMembers()).execute(
        updateSprint({ actorUserId, listId: MAQUETTES }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
    expect(spaces.events).toEqual([]);
  });

  it('refuses a guest, who sees no space', async () => {
    const refusal = await refusalOf(
      new UpdateList(atelierNord(), atelierNordMembers()).execute(
        updateSprint({ actorUserId: NADIA }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('refuses a list that does not exist', async () => {
    const refusal = await refusalOf(
      new UpdateList(atelierNord(), atelierNordMembers()).execute(
        updateSprint({ listId: UNKNOWN_LIST }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('refuses a list of another organization', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState({ organizationId: OTHER_ORGANIZATION })],
      lists: [sprintState({ organizationId: OTHER_ORGANIZATION })],
    });

    const refusal = await refusalOf(
      new UpdateList(spaces, atelierNordMembers()).execute(updateSprint()),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers organization-not-found to an account the copy of the members does not know', async () => {
    const refusal = await refusalOf(
      new UpdateList(atelierNord(), atelierNordMembers()).execute(
        updateSprint({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });
});

describe('UpdateList: the membership of the caller is locked, so a removal cannot slip in', () => {
  it('asks the directory for the role of the caller with the lock', async () => {
    const members = atelierNordMembers();

    await new UpdateList(atelierNord(), members).execute(updateSprint());

    expect(members.roleCalls).toEqual([{ organizationId: ATELIER_NORD, userId: LEA, lock: true }]);
  });
});

describe('UpdateList: the lists of a private space that awaits an owner are unknown to everyone', () => {
  it.each([
    ['its former owner', HUGO],
    ['the owner of the organization', CAMILLE],
  ])('hides them from %s', async (_who: string, actorUserId: string) => {
    const spaces = new InMemorySpaces({
      spaces: [designState({ awaitingOwner: true })],
      lists: [backlogState({ id: MAQUETTES, spaceId: DESIGN })],
    });

    const refusal = await refusalOf(
      new UpdateList(spaces, atelierNordMembers()).execute(
        updateSprint({ actorUserId, listId: MAQUETTES }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });
});

describe('UpdateList: a change of a list needs edit on it, then the version, then the rules', () => {
  /**
   * Atelier Nord with Sprint 14 (version 2) shared with Léa Petit and the guest Nadia Benali.
   *
   * @param role - The role of the grant of Léa Petit on Sprint 14.
   * @param organizationAccess - The switch of Sprint 14.
   * @returns The fake store.
   */
  function sprintShared(
    role: 'edit' | 'comment' | 'view',
    organizationAccess: boolean,
  ): InMemorySpaces {
    return new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ version: 2, organizationAccess })],
      grants: [
        listGrantOf(PRODUIT, SPRINT_14, LEA, role),
        listGrantOf(PRODUIT, SPRINT_14, NADIA, 'view'),
      ],
    });
  }

  it.each([['comment'], ['view']] as const)(
    'refuses role-insufficient with the role %s on the list, and stores nothing',
    async (role: 'comment' | 'view') => {
      const spaces = sprintShared(role, false);

      const refusal = await refusalOf(
        new UpdateList(spaces, atelierNordMembers()).execute(updateSprint()),
      );

      expect(refusal).toEqual({ reason: 'role-insufficient', role });
      expect(spaces.lists.get(SPRINT_14)?.version).toBe(2);
      expect(spaces.events).toEqual([]);
    },
  );

  it('refuses role-insufficient to a guest whose grant of the list is view', async () => {
    const refusal = await refusalOf(
      new UpdateList(sprintShared('edit', true), atelierNordMembers()).execute(
        updateSprint({ actorUserId: NADIA }),
      ),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('answers role-insufficient before a stale If-Match', async () => {
    const refusal = await refusalOf(
      new UpdateList(sprintShared('view', false), atelierNordMembers()).execute(
        updateSprint({ expectedVersions: [1] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('answers list-not-found to a member of the organization when the switch is off and nothing is shared', async () => {
    const refusal = await refusalOf(
      new UpdateList(sprintShared('edit', false), atelierNordMembers()).execute(
        updateSprint({ actorUserId: HUGO }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('lets the owner of the space change a list whose switch is off', async () => {
    const { list } = await new UpdateList(
      sprintShared('view', false),
      atelierNordMembers(),
    ).execute(updateSprint({ actorUserId: CAMILLE }));

    expect(list.name).toBe('Sprint 14 bis');
  });

  it('lets a guest with edit through the grant of the list change it', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ version: 2 })],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'edit')],
    });

    const view = await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({ actorUserId: NADIA }),
    );

    expect(view).toMatchObject({ callerRole: 'edit', list: { version: 3 } });
  });
});

describe('UpdateList: the switch "Accès de l’organisation" emits list.access-changed', () => {
  /** Sprint 14 (version 2), shared with Léa Petit (comment) then Nadia Benali (view). */
  function sprintWithGrants(): InMemorySpaces {
    return new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ version: 2 })],
      grants: [
        listGrantOf(PRODUIT, SPRINT_14, LEA, 'comment'),
        listGrantOf(PRODUIT, SPRINT_14, NADIA, 'view', {
          createdAt: new Date('2026-03-05T09:00:00Z'),
        }),
      ],
    });
  }

  it('turns the switch off at the next version, with every grant and no person changed', async () => {
    const spaces = sprintWithGrants();

    const view = await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({ actorUserId: HUGO, patch: { organizationAccess: false } }),
    );

    expect(view.list).toEqual(sprintState({ version: 3, organizationAccess: false }));
    expect(spaces.events).toEqual([
      {
        kind: 'listAccessChanged',
        listId: SPRINT_14,
        spaceId: PRODUIT,
        version: 3,
        organizationAccess: false,
        grants: [
          { userId: LEA, role: 'comment' },
          { userId: NADIA, role: 'view' },
        ],
        changed: ['organizationAccess'],
        changedUserIds: [],
        actor: { type: 'user', id: HUGO },
      },
    ]);
  });

  it('answers edit, the role it was made with, to a plain member who loses the list by turning it off', async () => {
    const spaces = sprintWithGrants();
    const update = new UpdateList(spaces, atelierNordMembers());

    const view = await update.execute(
      updateSprint({ actorUserId: HUGO, patch: { organizationAccess: false } }),
    );

    expect(view.callerRole).toBe('edit');
    expect(await refusalOf(update.execute(updateSprint({ actorUserId: HUGO })))).toEqual({
      reason: 'list-not-found',
    });
  });

  it('emits list.updated then list.access-changed with the one next version for a content and a switch change', async () => {
    const spaces = sprintWithGrants();

    await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({
        actorUserId: CAMILLE,
        patch: { name: 'Sprint 15', organizationAccess: false },
      }),
    );

    expect(spaces.lists.get(SPRINT_14)?.version).toBe(3);
    expect(spaces.events).toEqual([
      expect.objectContaining({ kind: 'listUpdated', version: 3, changed: ['name'] }),
      expect.objectContaining({
        kind: 'listAccessChanged',
        version: 3,
        changed: ['organizationAccess'],
      }),
    ]);
  });

  it('emits only list.updated for a content change, the switch left as it is', async () => {
    const spaces = sprintWithGrants();

    await new UpdateList(spaces, atelierNordMembers()).execute(
      updateSprint({ patch: { name: 'Sprint 15', organizationAccess: true } }),
    );

    expect(spaces.events.map((event) => event.kind)).toEqual(['listUpdated']);
  });
});
