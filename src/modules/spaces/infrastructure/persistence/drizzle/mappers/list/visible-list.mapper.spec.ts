import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { toListWithGrants, visibleListCondition } from './visible-list.mapper.js';
import type { VisibleListRow } from './visible-list.mapper.js';

/** The organization of the transaction. */
const ORGANIZATION = 'organization';

/** The grant of the viewer on the list of the row, by the primary key of `list_grants`. */
const LIST_GRANT = `(select "list_grants"."role" from "list_grants" where "list_grants"."organization_id" = $1 and "list_grants"."list_id" = "lists"."id" and "list_grants"."user_id" = $2) is not null`;

/**
 * Builds a row of a collection of lists: Sprint 14 of Produit.
 *
 * @param overrides - Fields to replace.
 * @returns The row.
 */
function sprint14Row(overrides: Partial<VisibleListRow> = {}): VisibleListRow {
  return {
    list: {
      organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f',
      id: '019a7100-0000-7000-8000-000000000002',
      spaceId: '019a7000-0000-7000-8000-000000000001',
      name: 'Sprint 14',
      icon: null,
      color: 'indigo',
      sprintStartDate: '2026-11-03',
      sprintEndDate: '2026-11-17',
      sprintGoal: null,
      organizationAccess: false,
      createdAt: new Date('2026-10-20T09:00:00Z'),
      updatedAt: new Date('2026-10-20T09:00:00Z'),
      version: 4,
    },
    visibility: 'organization',
    ownerUserId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
    awaitingOwner: false,
    spaceGrantRole: null,
    listGrantRole: 'comment',
    ...overrides,
  };
}

describe('visibleListCondition: the lists a member has a role on', () => {
  it('keeps for a member a grant of the list, the owner, the switch of a space of the organization and a grant of the space', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleListCondition(ORGANIZATION, { userId: 'viewer', role: 'member' }),
    );

    expect(text).toBe(
      `(not "spaces"."awaiting_owner" and (${LIST_GRANT} or "spaces"."owner_user_id" = $3 or ("spaces"."visibility" = 'organization' and "lists"."organization_access") or (select "space_grants"."role" from "space_grants" where "space_grants"."organization_id" = $4 and "space_grants"."space_id" = "spaces"."id" and "space_grants"."user_id" = $5) is not null))`,
    );
    expect(params).toEqual([ORGANIZATION, 'viewer', 'viewer', ORGANIZATION, 'viewer']);
  });

  it('keeps for a guest the lists shared with them only', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleListCondition(ORGANIZATION, { userId: 'viewer', role: 'guest' }),
    );

    expect(text).toBe(`(not "spaces"."awaiting_owner" and ${LIST_GRANT})`);
    expect(params).toEqual([ORGANIZATION, 'viewer']);
  });
});

describe('toListWithGrants: a row of a collection of lists', () => {
  it('maps the list with its switch, its space as the policies read it and the grants', () => {
    const row: ReturnType<typeof toListWithGrants> = toListWithGrants(sprint14Row());

    expect(row.list.snapshot.organizationAccess).toBe(false);
    expect(row.space).toEqual({
      visibility: 'organization',
      ownerUserId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
      awaitingOwner: false,
    });
    expect(row.grants).toEqual({ space: null, list: 'comment' });
  });

  it('refuses a stored role outside the three roles', () => {
    expect(() => toListWithGrants(sprint14Row({ listGrantRole: 'owner' }))).toThrow(
      'A stored role is not edit, comment or view.',
    );
  });
});
