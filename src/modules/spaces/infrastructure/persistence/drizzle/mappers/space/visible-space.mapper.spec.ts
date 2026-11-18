import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { visibleSpaceCondition } from './visible-space.mapper.js';

describe('visibleSpaceCondition: the spaces a member sees', () => {
  it('is one parenthesized term: the open and owned spaces, and not those awaiting an owner', () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(visibleSpaceCondition('viewer'));

    expect(text).toBe(
      `(("spaces"."visibility" = 'organization' or "spaces"."owner_user_id" = $1) and not "spaces"."awaiting_owner")`,
    );
    expect(params).toEqual(['viewer']);
  });

  it('stays one term under a negation', () => {
    const { sql: text } = new PgDialect().sqlToQuery(sql`not ${visibleSpaceCondition('viewer')}`);

    expect(text.startsWith('not ((')).toBe(true);
    expect(text.endsWith('"spaces"."awaiting_owner")')).toBe(true);
  });
});
