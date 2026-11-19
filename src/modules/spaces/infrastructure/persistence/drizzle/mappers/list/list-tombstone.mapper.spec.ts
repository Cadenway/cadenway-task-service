import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { deletedListCondition, undeletedListCondition } from './list-tombstone.mapper.js';

describe('the tombstone conditions of the lists', () => {
  it('leaves the deleted lists out, and keeps them for the deletion machinery', () => {
    expect(new PgDialect().sqlToQuery(undeletedListCondition()).sql).toBe(
      '"lists"."deleted_at" is null',
    );
    expect(new PgDialect().sqlToQuery(deletedListCondition()).sql).toBe(
      '"lists"."deleted_at" is not null',
    );
  });
});
