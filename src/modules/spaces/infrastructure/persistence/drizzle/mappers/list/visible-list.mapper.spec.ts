import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { InvalidListError } from '../../../../../domain/errors/list/invalid-list.error.js';
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
      archivedAt: null,
      archivedByType: null,
      archivedById: null,
      restoredAt: null,
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

  it('maps a live list with no archive and no restoration', () => {
    const { list } = toListWithGrants(sprint14Row());

    expect(list.snapshot).toMatchObject({ archivedAt: null, archivedBy: null, restoredAt: null });
  });

  it('maps the archive of an archived list and the restoration of a restored one', () => {
    const base: VisibleListRow = sprint14Row();
    const archived = toListWithGrants({
      ...base,
      list: {
        ...base.list,
        archivedAt: new Date('2026-11-03T09:00:00Z'),
        archivedByType: 'user',
        archivedById: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
        restoredAt: new Date('2026-10-30T09:00:00Z'),
      },
    });

    expect(archived.list.snapshot).toMatchObject({
      archivedAt: new Date('2026-11-03T09:00:00Z'),
      archivedBy: { type: 'user', id: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30' },
      restoredAt: new Date('2026-10-30T09:00:00Z'),
    });
  });

  it('refuses a stored actor type outside those of Actor', () => {
    const base: VisibleListRow = sprint14Row();

    expect(() =>
      toListWithGrants({
        ...base,
        list: {
          ...base.list,
          archivedAt: new Date('2026-11-03T09:00:00Z'),
          archivedByType: 'robot',
          archivedById: 'r2d2',
        },
      }),
    ).toThrow('A stored actor type is not user, automation, git or system.');
  });

  it('refuses an archive stored by halves, as the domain does', () => {
    const base: VisibleListRow = sprint14Row();

    expect(() =>
      toListWithGrants({
        ...base,
        list: { ...base.list, archivedAt: new Date('2026-11-03T09:00:00Z') },
      }),
    ).toThrow(InvalidListError);
  });

  it('refuses a stored role outside the three roles', () => {
    expect(() => toListWithGrants(sprint14Row({ listGrantRole: 'owner' }))).toThrow(
      'A stored role is not edit, comment or view.',
    );
  });
});
