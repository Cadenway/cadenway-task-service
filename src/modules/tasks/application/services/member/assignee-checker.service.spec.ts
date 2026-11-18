import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  INES,
  NADIA,
  STRANGER,
  atelierNordMembers,
} from '../../use-cases/tasks.fixture.js';
import { AssigneeChecker } from './assignee-checker.service.js';

describe('AssigneeChecker: the roles of the people about to be assigned come from the copy', () => {
  it('reads each role in the order the request gave, with null for an unknown account', async () => {
    const candidates = await new AssigneeChecker(atelierNordMembers()).candidates(
      ATELIER_NORD,
      [NADIA, HUGO, STRANGER],
      false,
    );

    expect(candidates).toEqual([
      { userId: NADIA, role: 'guest' },
      { userId: HUGO, role: 'member' },
      { userId: STRANGER, role: null },
    ]);
  });

  it('reads an account named twice once and gives a candidate for each mention', async () => {
    const members = atelierNordMembers();

    const candidates = await new AssigneeChecker(members).candidates(
      ATELIER_NORD,
      [HUGO, HUGO],
      false,
    );

    expect(candidates).toHaveLength(2);
    expect(members.roleCalls).toHaveLength(1);
  });

  it('locks the memberships in ascending id order, whatever the order of the request', async () => {
    const members = atelierNordMembers();

    await new AssigneeChecker(members).candidates(ATELIER_NORD, [HUGO, INES, CAMILLE], true);

    expect(members.roleCalls).toEqual([
      { userId: CAMILLE, lock: true },
      { userId: INES, lock: true },
      { userId: HUGO, lock: true },
    ]);
  });

  it('reads nothing for no account', async () => {
    const members = atelierNordMembers();

    expect(await new AssigneeChecker(members).candidates(ATELIER_NORD, [], true)).toEqual([]);
    expect(members.roleCalls).toEqual([]);
  });
});
