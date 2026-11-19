import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  InMemorySpaces,
  NADIA,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  atelierNordMembers,
  listGrantOf,
  refusalOf,
  spaceState,
  sprintState,
} from '../../../spaces.fixture.js';
import type { CheckListAccessInput } from './check-list-access.input.js';
import { CheckListAccess } from './check-list-access.use-case.js';

/**
 * Builds the check of the socket of the guest Nadia Benali for Sprint 14.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function check(overrides: Partial<CheckListAccessInput> = {}): CheckListAccessInput {
  return { organizationId: ATELIER_NORD, actorUserId: NADIA, listId: SPRINT_14, ...overrides };
}

/** Sprint 14 (switch off) shared with Nadia Benali. */
function atelierNord(): InMemorySpaces {
  return new InMemorySpaces({
    spaces: [spaceState()],
    lists: [sprintState({ organizationAccess: false })],
    grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'comment')],
  });
}

describe('CheckListAccess: the realtime gateway reads the role of a person on a list', () => {
  it('answers the role of the person, the space and the list', async () => {
    const access = await new CheckListAccess(atelierNord(), atelierNordMembers()).execute(check());

    expect(access).toEqual({ role: 'comment', spaceId: PRODUIT, listId: SPRINT_14 });
  });

  it('answers the role on an archived list as on a live one', async () => {
    const spaces = new InMemorySpaces({
      spaces: [spaceState()],
      lists: [
        sprintState({
          organizationAccess: false,
          archivedAt: ARCHIVED_AT,
          archivedBy: { type: 'user', id: CAMILLE },
        }),
      ],
      grants: [listGrantOf(PRODUIT, SPRINT_14, NADIA, 'comment')],
    });

    const access = await new CheckListAccess(spaces, atelierNordMembers()).execute(check());

    expect(access).toEqual({ role: 'comment', spaceId: PRODUIT, listId: SPRINT_14 });
  });

  it('answers edit to the owner of the space whatever the switch', async () => {
    const access = await new CheckListAccess(atelierNord(), atelierNordMembers()).execute(
      check({ actorUserId: CAMILLE }),
    );

    expect(access.role).toBe('edit');
  });

  it.each([
    ['a member the list is not shared with while its switch is off', check({ actorUserId: HUGO })],
    ['a list that does not exist', check({ listId: UNKNOWN_LIST })],
  ])('answers list-not-found for %s', async (_case: string, input: CheckListAccessInput) => {
    const refusal = await refusalOf(
      new CheckListAccess(atelierNord(), atelierNordMembers()).execute(input),
    );

    expect(refusal).toEqual({ reason: 'list-not-found' });
  });

  it('answers organization-not-found to a person the copy does not hold', async () => {
    const refusal = await refusalOf(
      new CheckListAccess(atelierNord(), atelierNordMembers()).execute(
        check({ actorUserId: STRANGER }),
      ),
    );

    expect(refusal).toEqual({ reason: 'organization-not-found' });
  });

  it('writes nothing, emits nothing and locks nothing', async () => {
    const spaces = atelierNord();
    const members = atelierNordMembers();

    await new CheckListAccess(spaces, members).execute(check());

    expect(spaces.events).toEqual([]);
    expect(spaces.journal).toEqual([]);
    expect(members.roleCalls).toEqual([
      { organizationId: ATELIER_NORD, userId: NADIA, lock: false },
    ]);
  });
});
