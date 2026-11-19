import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  archivedListAfter,
  archivedListCondition,
  listPositionInSpace,
  liveListCondition,
} from './list-archive.mapper.js';

/**
 * Renders a condition or an expression as PostgreSQL text.
 *
 * @param fragment - The SQL.
 * @returns The text and its parameters.
 */
function render(fragment: SQL): { readonly sql: string; readonly params: unknown[] } {
  const { sql, params } = new PgDialect().sqlToQuery(fragment);
  return { sql, params };
}

describe('liveListCondition: the collections of a space, of the sprints and of the sidebar keep the live lists', () => {
  it('keeps the lists that are not archived', () => {
    expect(render(liveListCondition())).toEqual({
      sql: '"lists"."archived_at" is null',
      params: [],
    });
  });
});

describe('archivedListCondition: the archives read the partial index of the archived lists', () => {
  it('repeats the predicate of lists_organization_archived_index', () => {
    expect(render(archivedListCondition()).sql).toBe('"lists"."archived_at" is not null');
  });
});

describe('archivedListAfter: the archives continue after a position, the latest first', () => {
  it('adds no condition for the first page', () => {
    expect(archivedListAfter(null)).toBeUndefined();
  });

  it('keeps the lists archived before the position, the id descending as tie-breaker', () => {
    const condition: SQL | undefined = archivedListAfter({
      archivedAt: new Date('2026-11-03T09:00:00.123Z'),
      id: '019a7100-0000-7000-8000-000000000002',
    });

    expect(condition === undefined ? undefined : render(condition)).toEqual({
      sql: '("lists"."archived_at", "lists"."id") < ($1::timestamptz, $2::uuid)',
      params: ['2026-11-03T09:00:00.123Z', '019a7100-0000-7000-8000-000000000002'],
    });
  });
});

describe('listPositionInSpace: a restored list goes to the end of its space', () => {
  it('places a list by its last restoration, or else by its creation', () => {
    expect(render(listPositionInSpace()).sql).toBe(
      'coalesce("lists"."restored_at", "lists"."created_at")',
    );
  });
});
