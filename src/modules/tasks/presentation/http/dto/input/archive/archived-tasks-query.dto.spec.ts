import { describe, expect, it } from 'vitest';

import { ArchivedListsQuery } from './archived-lists-query.dto.js';
import { ArchivedTasksQuery } from './archived-tasks-query.dto.js';

describe.each([
  ['the archived tasks', ArchivedTasksQuery],
  ['the archived lists', ArchivedListsQuery],
])('the query of %s', (_name, query) => {
  it('takes 50 rows by default and reads limit as a number', () => {
    expect(query.schema.parse({})).toEqual({ limit: 50 });
    expect(query.schema.parse({ limit: '10', cursor: 'abc' })).toEqual({
      limit: 10,
      cursor: 'abc',
    });
  });

  it.each(['0', '101', 'x'])('refuses the limit %s', (limit: string) => {
    expect(query.schema.safeParse({ limit }).success).toBe(false);
  });
});
