import { describe, expect, it } from 'vitest';

import { ListActivityQuery } from './list-activity-query.dto.js';

describe('the query of the activity of a list', () => {
  it('reads kind and actorId from comma-separated texts', () => {
    expect(
      ListActivityQuery.schema.parse({
        kind: 'status,priority',
        actorId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31,task-service',
      }),
    ).toMatchObject({
      kind: ['status', 'priority'],
      actorId: ['019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31', 'task-service'],
    });
  });

  it('leaves the filters absent and applies the default page size', () => {
    expect(ListActivityQuery.schema.parse({})).toStrictEqual({ limit: 50 });
  });

  it('refuses an empty actor, more than 20 actors and U+0000 in an actor, on actorId', () => {
    const twentyOne: string = Array.from(
      { length: 21 },
      (_, index) => `actor-${String(index)}`,
    ).join(',');

    for (const actorId of ['', 'a,', twentyOne, 'a\u0000b']) {
      const result = ListActivityQuery.schema.safeParse({ actorId });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.every((issue) => issue.path[0] === 'actorId')).toBe(true);
      }
    }
  });

  it('refuses a kind that is not one of the six, on kind', () => {
    const result = ListActivityQuery.schema.safeParse({ kind: 'status,unknown' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.every((issue) => issue.path[0] === 'kind')).toBe(true);
    }
  });
});
