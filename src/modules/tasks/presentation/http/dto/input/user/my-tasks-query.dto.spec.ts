import { describe, expect, it } from 'vitest';

import { MyTasksPath } from './my-tasks-path.dto.js';
import { MyTasksQuery } from './my-tasks-query.dto.js';

const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

describe('the query of the tasks of an account', () => {
  it('shows the open tab, 50 tasks a page, by default', () => {
    expect(MyTasksQuery.schema.parse({})).toStrictEqual({ state: 'open', limit: 50 });
  });

  it('accepts the closed tab, a cursor and a page size', () => {
    expect(
      MyTasksQuery.schema.parse({ state: 'closed', cursor: 'abc', limit: '10' }),
    ).toStrictEqual({ state: 'closed', cursor: 'abc', limit: 10 });
  });

  it('refuses another tab and a page size outside 1 to 100', () => {
    expect(MyTasksQuery.schema.safeParse({ state: 'all' }).success).toBe(false);
    expect(MyTasksQuery.schema.safeParse({ limit: '0' }).success).toBe(false);
    expect(MyTasksQuery.schema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('the path of the tasks of an account', () => {
  it('accepts an account id in either case and refuses another text', () => {
    expect(MyTasksPath.schema.safeParse({ userId: CAMILLE }).success).toBe(true);
    expect(MyTasksPath.schema.safeParse({ userId: CAMILLE.toUpperCase() }).success).toBe(true);
    expect(MyTasksPath.schema.safeParse({ userId: 'me' }).success).toBe(false);
  });
});
