import { describe, expect, it } from 'vitest';

import { SpaceOverviewQuery } from './space-overview-query.dto.js';

describe('the query of the overview of a space', () => {
  it('requires today and applies the page size of the contract, 50 by default', () => {
    expect(SpaceOverviewQuery.schema.safeParse({}).success).toBe(false);
    expect(SpaceOverviewQuery.schema.parse({ today: '2026-11-08' })).toStrictEqual({
      today: '2026-11-08',
      limit: 50,
    });
  });

  it('reads the cursor and a page size from 1 to 100', () => {
    expect(
      SpaceOverviewQuery.schema.parse({ today: '2026-11-08', cursor: 'abc', limit: '100' }),
    ).toStrictEqual({ today: '2026-11-08', cursor: 'abc', limit: 100 });
    expect(SpaceOverviewQuery.schema.safeParse({ today: '2026-11-08', limit: '0' }).success).toBe(
      false,
    );
    expect(SpaceOverviewQuery.schema.safeParse({ today: '2026-11-08', limit: '101' }).success).toBe(
      false,
    );
  });

  it('refuses a date of the year 0000, one that does not exist and a time, on today', () => {
    for (const today of ['0000-11-08', '2026-02-30', '2026-11-08T10:00:00Z', 'today', '']) {
      const result = SpaceOverviewQuery.schema.safeParse({ today });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.every((issue) => issue.path[0] === 'today')).toBe(true);
      }
    }
  });
});
