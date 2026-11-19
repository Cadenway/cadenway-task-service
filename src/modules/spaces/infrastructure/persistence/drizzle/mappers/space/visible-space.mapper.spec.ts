import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { visibleSpaceCondition } from './visible-space.mapper.js';

/** The organization of the transaction. */
const ORGANIZATION = 'organization';

/** The grant of the viewer on the space of the row, by the primary key of `space_grants`. */
const SPACE_GRANT = `(select "space_grants"."role" from "space_grants" where "space_grants"."organization_id" = $2 and "space_grants"."space_id" = "spaces"."id" and "space_grants"."user_id" = $3)`;

/** Whether the viewer holds a grant of a list of the space of the row, by `list_grants_user_index`. */
const ANY_LIST_GRANT = `exists (select 1 from "list_grants" where "list_grants"."organization_id" = $4 and "list_grants"."user_id" = $5 and "list_grants"."space_id" = "spaces"."id")`;

describe('visibleSpaceCondition: the spaces a member sees', () => {
  it('keeps for a member the spaces of the organization, owned or shared, and those of shared lists', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleSpaceCondition(ORGANIZATION, { userId: 'viewer', role: 'member' }),
    );

    expect(text).toBe(
      `(not "spaces"."awaiting_owner" and ("spaces"."visibility" = 'organization' or "spaces"."owner_user_id" = $1 or ${SPACE_GRANT} is not null or ${ANY_LIST_GRANT}))`,
    );
    expect(params).toEqual(['viewer', ORGANIZATION, 'viewer', ORGANIZATION, 'viewer']);
  });

  it('keeps for a guest the spaces of the lists shared with them only', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      visibleSpaceCondition(ORGANIZATION, { userId: 'viewer', role: 'guest' }),
    );

    expect(text).toBe(
      `(not "spaces"."awaiting_owner" and exists (select 1 from "list_grants" where "list_grants"."organization_id" = $1 and "list_grants"."user_id" = $2 and "list_grants"."space_id" = "spaces"."id"))`,
    );
    expect(params).toEqual([ORGANIZATION, 'viewer']);
  });

  it('stays one term under a negation', () => {
    const { sql: text } = new PgDialect().sqlToQuery(
      sql`not ${visibleSpaceCondition(ORGANIZATION, { userId: 'viewer', role: 'owner' })}`,
    );

    expect(text.startsWith('not (not "spaces"."awaiting_owner" and (')).toBe(true);
    expect(text.endsWith('))')).toBe(true);
  });
});
