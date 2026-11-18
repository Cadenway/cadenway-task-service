import { describe, expect, it } from 'vitest';

import { ListCountsQuery } from './list-counts-query.dto.js';

describe('the query of the counters of a list', () => {
  it('requires today and accepts a calendar date', () => {
    expect(ListCountsQuery.schema.safeParse({}).success).toBe(false);
    expect(ListCountsQuery.schema.parse({ today: '2026-11-08' })).toStrictEqual({
      today: '2026-11-08',
    });
  });

  it('refuses a date of the year 0000, one that does not exist and a time, on today', () => {
    for (const today of ['0000-11-08', '2026-02-30', '2026-11-08T10:00:00Z', 'today', '']) {
      const result = ListCountsQuery.schema.safeParse({ today });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.every((issue) => issue.path[0] === 'today')).toBe(true);
      }
    }
  });

  it('accepts the year 0001, which PostgreSQL stores', () => {
    expect(ListCountsQuery.schema.safeParse({ today: '0001-01-01' }).success).toBe(true);
  });
});
