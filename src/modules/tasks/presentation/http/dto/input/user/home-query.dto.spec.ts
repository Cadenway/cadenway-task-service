import { describe, expect, it } from 'vitest';

import { HomePath } from './home-path.dto.js';
import { HomeQuery } from './home-query.dto.js';

const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

describe('the query of the home of an account', () => {
  it('requires today and accepts a calendar date', () => {
    expect(HomeQuery.schema.safeParse({}).success).toBe(false);
    expect(HomeQuery.schema.parse({ today: '2026-11-08' })).toStrictEqual({ today: '2026-11-08' });
  });

  it('refuses a date of the year 0000, one that does not exist and a time, on today', () => {
    for (const today of ['0000-11-08', '2026-02-30', '2026-11-08T10:00:00Z', 'today', '']) {
      const result = HomeQuery.schema.safeParse({ today });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.every((issue) => issue.path[0] === 'today')).toBe(true);
      }
    }
  });
});

describe('the path of the home of an account', () => {
  it('accepts an account id in either case and refuses another text', () => {
    expect(HomePath.schema.safeParse({ userId: CAMILLE }).success).toBe(true);
    expect(HomePath.schema.safeParse({ userId: CAMILLE.toUpperCase() }).success).toBe(true);
    expect(HomePath.schema.safeParse({ userId: 'me' }).success).toBe(false);
  });
});
