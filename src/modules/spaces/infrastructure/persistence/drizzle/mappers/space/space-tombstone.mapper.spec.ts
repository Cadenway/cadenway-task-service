import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { deletedSpaceCondition, undeletedSpaceCondition } from './space-tombstone.mapper.js';

describe('undeletedSpaceCondition: the tombstones of the spaces are left out', () => {
  it('keeps the spaces that are not deleted', () => {
    expect(new PgDialect().sqlToQuery(undeletedSpaceCondition()).sql).toBe(
      '"spaces"."deleted_at" is null',
    );
  });
});

describe('deletedSpaceCondition: the erasure reads the tombstones only', () => {
  it('keeps the spaces that are deleted', () => {
    expect(new PgDialect().sqlToQuery(deletedSpaceCondition()).sql).toBe(
      '"spaces"."deleted_at" is not null',
    );
  });
});
