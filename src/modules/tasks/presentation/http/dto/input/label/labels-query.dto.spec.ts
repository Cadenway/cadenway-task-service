import { describe, expect, it } from 'vitest';

import { LabelsQuery } from './labels-query.dto.js';

describe('the query of the labels', () => {
  it('applies the page size of the contract and leaves the search absent', () => {
    expect(LabelsQuery.schema.parse({})).toStrictEqual({ limit: 50 });
  });

  it('reads the search, the cursor and the page size', () => {
    expect(LabelsQuery.schema.parse({ search: 'aut', cursor: 'abc', limit: '20' })).toStrictEqual({
      search: 'aut',
      cursor: 'abc',
      limit: 20,
    });
  });

  it('refuses an empty search, one over 100 characters and U+0000, on search', () => {
    for (const search of ['', 'a'.repeat(101), 'a\u0000b']) {
      const result = LabelsQuery.schema.safeParse({ search });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.every((issue) => issue.path[0] === 'search')).toBe(true);
      }
    }
  });

  it('refuses a page size outside 1 to 100', () => {
    expect(LabelsQuery.schema.safeParse({ limit: '0' }).success).toBe(false);
    expect(LabelsQuery.schema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
