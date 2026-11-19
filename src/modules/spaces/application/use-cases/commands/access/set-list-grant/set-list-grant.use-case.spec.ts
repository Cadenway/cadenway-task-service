import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  DESIGN,
  INES,
  InMemorySpaces,
  LEA,
  NADIA,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  atelierNordMembers,
  backlogState,
  designState,
  listGrantOf,
  refusalOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { SetListGrantInput } from './set-list-grant.input.js';
import { SetListGrant } from './set-list-grant.use-case.js';

/** A list of the private space "Design". */
const MAQUETTES = '019a7100-0000-7000-8000-000000000003';

/**
 * Builds Léa Petit letting the guest Nadia Benali comment on Sprint 14.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function invite(overrides: Partial<SetListGrantInput> = {}): SetListGrantInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: LEA,
    listId: SPRINT_14,
    userId: NADIA,
    role: 'comment',
    expectedVersions: null,
    ...overrides,
  };
}

/** Atelier Nord: Sprint 14 (version 5) in Produit, Maquettes in the private Design shared with Léa Petit. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState()],
    lists: [
      sprintState({ version: 5 }),
      backlogState({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes' }),
    ],
    grants: [spaceGrantOf(DESIGN, LEA, 'view'), listGrantOf(PRODUIT, SPRINT_14, INES, 'view')],
  });
}

describe('SetListGrant: who has edit on a list gives a person a role on it', () => {
  it('lets a guest comment on Sprint 14 at the next version of the list, with list.access-changed', async () => {
    const spaces = atelierNord();

    const set = await new SetListGrant(spaces, atelierNordMembers()).execute(invite());

    expect(set.version).toBe(6);
    expect(set.grant).toMatchObject({
      userId: NADIA,
      role: 'comment',
      grantedBy: { type: 'user', id: LEA },
    });
    expect(spaces.lists.get(SPRINT_14)?.version).toBe(6);
    expect(spaces.events).toEqual([
      {
        kind: 'listAccessChanged',
        listId: SPRINT_14,
        spaceId: PRODUIT,
        version: 6,
        organizationAccess: true,
        grants: [
          { userId: INES, role: 'view' },
          { userId: NADIA, role: 'comment' },
        ],
        changed: ['grants'],
        changedUserIds: [NADIA],
        actor: { type: 'user', id: LEA },
      },
    ]);
  });

  it('stores the space of the list on the grant', async () => {
    const spaces = atelierNord();

    await new SetListGrant(spaces, atelierNordMembers()).execute(invite());

    expect(spaces.grants.find((grant) => grant.userId === NADIA)?.resource).toEqual({
      kind: 'list',
      spaceId: PRODUIT,
      listId: SPRINT_14,
    });
  });

  it('answers the same role again with the stored grant and version, writing and emitting nothing', async () => {
    const spaces = atelierNord();

    const set = await new SetListGrant(spaces, atelierNordMembers()).execute(
      invite({ userId: INES, role: 'view' }),
    );

    expect(set.version).toBe(5);
    expect(set.grant.role).toBe('view');
    expect(spaces.events).toEqual([]);
  });

  it('shares an archived list as a live one, which stays archived', async () => {
    const archivedAt: Date = new Date('2026-11-03T09:00:00Z');
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [sprintState({ archivedAt, archivedBy: { type: 'user', id: CAMILLE }, version: 5 })],
    });

    const set = await new SetListGrant(spaces, atelierNordMembers()).execute(invite());

    expect(set.version).toBe(6);
    expect(spaces.lists.get(SPRINT_14)).toMatchObject({ archivedAt, version: 6 });
  });

  it('checks If-Match against the version of the list', async () => {
    const set = await new SetListGrant(atelierNord(), atelierNordMembers()).execute(
      invite({ expectedVersions: [5] }),
    );

    expect(set.version).toBe(6);
  });

  it('locks the memberships, then the space of the list for share, then the list', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();
    members.journal = spaces.journal;

    await new SetListGrant(spaces, members).execute(invite());

    expect(spaces.journal).toEqual([
      `membership ${LEA}`,
      `membership ${NADIA}`,
      `space ${PRODUIT} share`,
      `list ${SPRINT_14}`,
    ]);
  });
});

describe('SetListGrant: the refusals come in the order of the contract', () => {
  it('answers list-not-found for a list that does not exist', async () => {
    const refusal = await refusalOf(
      new SetListGrant(atelierNord(), atelierNordMembers()).execute(
        invite({ listId: UNKNOWN_LIST }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers list-not-found for a list the actor has no role on', async () => {
    const refusal = await refusalOf(
      new SetListGrant(atelierNord(), atelierNordMembers()).execute(
        invite({ actorUserId: INES, listId: MAQUETTES }),
      ),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('refuses role-insufficient with the role of the actor, before If-Match', async () => {
    const refusal = await refusalOf(
      new SetListGrant(atelierNord(), atelierNordMembers()).execute(
        invite({ listId: MAQUETTES, expectedVersions: [9] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('refuses a stale If-Match with the version of the list, before the rules of the grant', async () => {
    const refusal = await refusalOf(
      new SetListGrant(atelierNord(), atelierNordMembers()).execute(
        invite({ userId: STRANGER, expectedVersions: [4] }),
      ),
    );

    expect(refusal).toEqual({ reason: 'version-mismatch', version: 5 });
  });

  it('refuses grantee-invalid for someone the copy does not hold', async () => {
    const refusal = await refusalOf(
      new SetListGrant(atelierNord(), atelierNordMembers()).execute(invite({ userId: STRANGER })),
    );

    expect(refusal).toEqual({ reason: 'grantee-invalid', userId: STRANGER });
  });

  it('refuses owner-unchangeable for the owner of the space of the list', async () => {
    const refusal = await refusalOf(
      new SetListGrant(atelierNord(), atelierNordMembers()).execute(invite({ userId: CAMILLE })),
    );

    expect(refusal).toEqual({ reason: 'owner-unchangeable' });
  });
});
