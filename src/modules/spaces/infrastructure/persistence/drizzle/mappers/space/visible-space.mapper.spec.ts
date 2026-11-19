import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  viewerListSpaces,
  viewerListSpacesJoin,
  viewerSpaceGrantJoin,
  visibleSpaceCondition,
} from './visible-space.mapper.js';

/** The organization of the transaction. */
const ORGANIZATION = 'organization';

describe('visibleSpaceCondition: the spaces a member sees', () => {
  it('keeps for a member the spaces of the organization, owned or shared, and those of shared lists', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleSpaceCondition({ userId: 'viewer', role: 'member' }),
    );

    expect(text).toBe(
      `(not "spaces"."awaiting_owner" and ("spaces"."visibility" = 'organization' or "spaces"."owner_user_id" = $1 or "viewer_space_grant"."role" is not null or "viewer_list_spaces"."space_id" is not null))`,
    );
    expect(params).toEqual(['viewer']);
  });

  it('keeps for a guest the spaces of the lists shared with them only', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleSpaceCondition({ userId: 'viewer', role: 'guest' }),
    );

    expect(text).toBe(
      `(not "spaces"."awaiting_owner" and "viewer_list_spaces"."space_id" is not null)`,
    );
    expect(params).toEqual([]);
  });

  it('stays one term under a negation', () => {
    const { sql: text } = new PgDialect().sqlToQuery(
      sql`not ${visibleSpaceCondition({ userId: 'viewer', role: 'owner' })}`,
    );

    expect(text.startsWith('not (not "spaces"."awaiting_owner" and (')).toBe(true);
    expect(text.endsWith('))')).toBe(true);
  });
});

describe('the joins of the grants of the viewer on the spaces', () => {
  it('joins the grant of the space on the full primary key of space_grants', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      viewerSpaceGrantJoin(ORGANIZATION, 'viewer'),
    );

    expect(text).toBe(
      `"viewer_space_grant"."organization_id" = $1 and "viewer_space_grant"."space_id" = "spaces"."id" and "viewer_space_grant"."user_id" = $2`,
    );
    expect(params).toEqual([ORGANIZATION, 'viewer']);
  });

  it('reads the spaces of the lists shared with the viewer once, by organization and account', () => {
    const subquery = new PgDialect().sqlToQuery(viewerListSpaces(ORGANIZATION, 'viewer'));
    const join = new PgDialect().sqlToQuery(viewerListSpacesJoin());

    expect(subquery.sql).toBe(
      `(select distinct "list_grants"."space_id" from "list_grants" where "list_grants"."organization_id" = $1 and "list_grants"."user_id" = $2) as "viewer_list_spaces"`,
    );
    expect(subquery.params).toEqual([ORGANIZATION, 'viewer']);
    expect(join.sql).toBe(`"viewer_list_spaces"."space_id" = "spaces"."id"`);
  });
});
