import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { InvalidListError } from '../../../../../domain/errors/list/invalid-list.error.js';
import {
  listAccessCondition,
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
      deletedAt: null,
      deletedByType: null,
      deletedById: null,
      createdAt: new Date('2026-10-20T09:00:00Z'),
      updatedAt: new Date('2026-10-20T09:00:00Z'),
      version: 4,
    },
    visibility: 'organization',
    ownerUserId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
    awaitingOwner: false,
    spaceDeletedAt: null,
    spaceGrantRole: null,
    listGrantRole: 'comment',
    ...overrides,
  };
}

/** The access condition of a member, as if neither the list nor its space were deleted. */
const MEMBER_ACCESS = `(not "spaces"."awaiting_owner" and ("viewer_list_grant"."role" is not null or "spaces"."owner_user_id" = $1 or ("spaces"."visibility" = 'organization' and "lists"."organization_access") or "viewer_space_grant"."role" is not null))`;

describe('visibleListCondition: the lists a member has a role on', () => {
  it('keeps for a member a grant of the list, the owner, the switch of a space of the organization and a grant of the space', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleListCondition({ userId: 'viewer', role: 'member' }),
    );

    expect(text).toBe(
      `("lists"."deleted_at" is null and "spaces"."deleted_at" is null and ${MEMBER_ACCESS})`,
    );
    expect(params).toEqual(['viewer']);
  });

  it('keeps for a guest the lists shared with them only', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleListCondition({ userId: 'viewer', role: 'guest' }),
    );

    expect(text).toBe(
      `("lists"."deleted_at" is null and "spaces"."deleted_at" is null and (not "spaces"."awaiting_owner" and "viewer_list_grant"."role" is not null))`,
    );
    expect(params).toEqual([]);
  });

  it('leaves out a deleted list and every list of a deleted space, whatever the role', () => {
    const { sql: text } = new PgDialect().sqlToQuery(
      visibleListCondition({ userId: 'viewer', role: 'owner' }),
    );

    expect(
      text.startsWith('("lists"."deleted_at" is null and "spaces"."deleted_at" is null and ('),
    ).toBe(true);
  });
});

describe('listAccessCondition: the trash reads the role a member would have as if not deleted', () => {
  it('keeps the same sources of a role as the collections, without the tombstones', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      listAccessCondition({ userId: 'viewer', role: 'member' }),
    );

    expect(text).toBe(MEMBER_ACCESS);
    expect(text).not.toContain('deleted_at');
    expect(params).toEqual(['viewer']);
  });
});

describe('the join of the grant of the viewer on the lists', () => {
  it('joins the grant of the list on the full primary key of list_grants', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      viewerListGrantJoin(ORGANIZATION, 'viewer'),
    );

    expect(text).toBe(
      `"viewer_list_grant"."organization_id" = $1 and "viewer_list_grant"."list_id" = "lists"."id" and "viewer_list_grant"."user_id" = $2 and public.organization_member_grant_is_effective("viewer_list_grant"."organization_id", "viewer_list_grant"."user_id", "viewer_list_grant"."member_id", "viewer_list_grant"."granted_at")`,
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
      deletedAt: null,
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

  it('maps the tombstone of a deleted list and of its space, which the policies fail closed on', () => {
    const base: VisibleListRow = sprint14Row({
      spaceDeletedAt: new Date('2026-11-08T16:00:00Z'),
    });
    const deleted = toListWithGrants({
      ...base,
      list: {
        ...base.list,
        deletedAt: new Date('2026-11-08T16:00:00Z'),
        deletedByType: 'user',
        deletedById: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
      },
    });

    expect(deleted.list.snapshot).toMatchObject({
      deletedAt: new Date('2026-11-08T16:00:00Z'),
      deletedBy: { type: 'user', id: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30' },
    });
    expect(deleted.space.deletedAt).toEqual(new Date('2026-11-08T16:00:00Z'));
  });

  it('refuses a tombstone stored by halves, as the domain does', () => {
    const base: VisibleListRow = sprint14Row();

    expect(() =>
      toListWithGrants({
        ...base,
        list: { ...base.list, deletedAt: new Date('2026-11-08T16:00:00Z') },
      }),
    ).toThrow(InvalidListError);
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
