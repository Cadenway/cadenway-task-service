import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  toListWithGrants,
  viewerListGrantJoin,
  visibleListCondition,
} from './visible-list.mapper.js';
import type { VisibleListRow } from './visible-list.mapper.js';

/** The organization of the transaction. */
const ORGANIZATION = 'organization';

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
      visibleListCondition({ userId: 'viewer', role: 'member' }),
    );

    expect(text).toBe(
      `(not "spaces"."awaiting_owner" and ("viewer_list_grant"."role" is not null or "spaces"."owner_user_id" = $1 or ("spaces"."visibility" = 'organization' and "lists"."organization_access") or "viewer_space_grant"."role" is not null))`,
    );
    expect(params).toEqual(['viewer']);
  });

  it('keeps for a guest the lists shared with them only', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleListCondition({ userId: 'viewer', role: 'guest' }),
    );

    expect(text).toBe(`(not "spaces"."awaiting_owner" and "viewer_list_grant"."role" is not null)`);
    expect(params).toEqual([]);
  });

  it('joins the grant of the list on the full primary key of list_grants', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      viewerListGrantJoin(ORGANIZATION, 'viewer'),
    );

    expect(text).toBe(
      `"viewer_list_grant"."organization_id" = $1 and "viewer_list_grant"."list_id" = "lists"."id" and "viewer_list_grant"."user_id" = $2`,
    );
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
