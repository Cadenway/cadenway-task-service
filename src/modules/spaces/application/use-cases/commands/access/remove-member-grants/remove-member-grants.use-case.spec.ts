import { describe, expect, it } from 'vitest';

import type { TaskListState } from '../../../../../domain/value-objects/list/task-list-state.value-object.js';
import type { SpaceState } from '../../../../../domain/value-objects/space/space-state.value-object.js';
import type { FakeGrant } from '../../../spaces.fixture.js';
import {
  ATELIER_NORD,
  DESIGN,
  INES,
  InMemorySpaces,
  LEA,
  PRODUIT,
  SPRINT_14,
  atelierNordMembers,
  designState,
  listGrantOf,
  spaceGrantOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import { RemoveMemberGrants } from './remove-member-grants.use-case.js';

/** The former member Léa Petit. */
const input = { organizationId: ATELIER_NORD, userId: LEA } as const;

/** What the clean-up records: the system, not a member, acts. */
const SYSTEM = { type: 'system', id: 'task-service' } as const;

/**
 * Builds the id of the n-th space or list of a spec.
 *
 * @param group - The first group of the id.
 * @param index - Which one.
 * @returns The id.
 */
function idOf(group: string, index: number): string {
  return `${group}-0000-7000-8000-${String(index).padStart(12, '0')}`;
}

/** Atelier Nord: Design (version 3) shared with Léa Petit and Inès Robert, Sprint 14 (version 2) with Léa Petit. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState(), designState({ version: 3 })],
    lists: [sprintState({ version: 2 })],
    grants: [
      spaceGrantOf(DESIGN, LEA, 'edit'),
      spaceGrantOf(DESIGN, INES, 'view'),
      listGrantOf(PRODUIT, SPRINT_14, LEA, 'comment'),
    ],
  });
}

describe('RemoveMemberGrants: a member who left loses their grants', () => {
  it('removes every grant of the account at the next version of each space and list, with their events', async () => {
    const spaces = atelierNord();

    const outcome = await new RemoveMemberGrants(
      spaces,
      atelierNordMembers({ removed: [LEA] }),
    ).execute(input);

    expect(outcome).toEqual({ outcome: 'removed', removed: 2 });
    expect(spaces.grants.map((grant) => grant.userId)).toEqual([INES]);
    expect(spaces.spaces.get(DESIGN)?.version).toBe(4);
    expect(spaces.lists.get(SPRINT_14)?.version).toBe(3);
    expect(spaces.events).toEqual([
      {
        kind: 'spaceAccessChanged',
        spaceId: DESIGN,
        version: 4,
        grants: [{ userId: INES, role: 'view' }],
        changedUserIds: [LEA],
        actor: SYSTEM,
      },
      {
        kind: 'listAccessChanged',
        listId: SPRINT_14,
        spaceId: PRODUIT,
        version: 3,
        organizationAccess: true,
        grants: [],
        changed: ['grants'],
        changedUserIds: [LEA],
        actor: SYSTEM,
      },
    ]);
  });

  it('answers none-left once no grant of the account remains, changing nothing', async () => {
    const spaces = atelierNord();
    const removeGrants = new RemoveMemberGrants(spaces, atelierNordMembers({ removed: [LEA] }));
    await removeGrants.execute(input);

    const outcome = await removeGrants.execute(input);

    expect(outcome).toEqual({ outcome: 'none-left' });
    expect(spaces.events).toHaveLength(2);
  });

  it('locks the spaces, then the lists, in the order of their ids, before it reads the copy', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers({ removed: [LEA] });

    await new RemoveMemberGrants(spaces, members).execute(input);

    expect(spaces.journal).toEqual([`space ${PRODUIT}`, `space ${DESIGN}`, `list ${SPRINT_14}`]);
    expect(members.roleCalls).toEqual([
      { organizationId: ATELIER_NORD, userId: LEA, lock: undefined },
    ]);
  });
});

describe('RemoveMemberGrants: a person who is a member again keeps their grants', () => {
  it('answers member-again and writes nothing while the copy holds the account', async () => {
    const spaces = atelierNord();

    const outcome = await new RemoveMemberGrants(spaces, atelierNordMembers()).execute(input);

    expect(outcome).toEqual({ outcome: 'member-again' });
    expect(spaces.grants).toHaveLength(3);
    expect(spaces.events).toEqual([]);
  });
});

describe('RemoveMemberGrants: batches of 100 grants, grants of spaces first', () => {
  /**
   * 60 spaces shared with Léa Petit, and 70 lists of Produit shared with her.
   *
   * @returns The fake store.
   */
  function manyGrants(): InMemorySpaces {
    const shared: SpaceState[] = Array.from({ length: 60 }, (_unused: unknown, index: number) =>
      designState({
        id: idOf('019a7400', index),
        prefix: `D${String.fromCharCode(65 + (index % 26))}`,
      }),
    );
    const lists: TaskListState[] = Array.from({ length: 70 }, (_unused: unknown, index: number) =>
      sprintState({ id: idOf('019a7500', index) }),
    );
    const grants: FakeGrant[] = [
      ...lists.map((list: TaskListState) => listGrantOf(PRODUIT, list.id, LEA, 'view')),
      ...shared.map((space: SpaceState) => spaceGrantOf(space.id, LEA, 'view')),
    ];
    return new InMemorySpaces({ spaces: [spaceState(), ...shared], lists, grants });
  }

  it('removes 130 grants in two batches of 100 and 30, the 60 grants of spaces in the first', async () => {
    const spaces = manyGrants();
    const removeGrants = new RemoveMemberGrants(spaces, atelierNordMembers({ removed: [LEA] }));

    const first = await removeGrants.execute(input);
    const kindsAfterFirst = spaces.grants.map((grant) => grant.resource.kind);
    const second = await removeGrants.execute(input);
    const third = await removeGrants.execute(input);

    expect(first).toEqual({ outcome: 'removed', removed: 100 });
    expect(kindsAfterFirst).toHaveLength(30);
    expect(new Set(kindsAfterFirst)).toEqual(new Set(['list']));
    expect(second).toEqual({ outcome: 'removed', removed: 30 });
    expect(third).toEqual({ outcome: 'none-left' });
    expect(spaces.runs).toBe(3);
  });
});
