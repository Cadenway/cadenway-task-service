import { describe, expect, it } from 'vitest';

import { TaskActivityQuery } from './task-activity-query.dto.js';

describe('the query of the activity of a task', () => {
  it('applies the default page size and leaves the kinds absent', () => {
    expect(TaskActivityQuery.schema.parse({})).toStrictEqual({ limit: 50 });
  });

  it('reads kind from a comma-separated text, as the gateway forwards it', () => {
    expect(TaskActivityQuery.schema.parse({ kind: 'status,assign' })).toMatchObject({
      kind: ['status', 'assign'],
    });
    expect(TaskActivityQuery.schema.parse({ kind: 'due' })).toMatchObject({ kind: ['due'] });
  });

  it('reads kind from a repeated parameter', () => {
    expect(TaskActivityQuery.schema.parse({ kind: ['status', 'due,assign'] })).toMatchObject({
      kind: ['status', 'due', 'assign'],
    });
  });

  it('refuses a kind that is not one of the six, an empty item and an empty text, on kind', () => {
    for (const kind of ['unknown', 'status,', ',', '']) {
      const result = TaskActivityQuery.schema.safeParse({ kind });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.every((issue) => issue.path[0] === 'kind')).toBe(true);
      }
    }
  });

  it('refuses a page size out of 1 to 100 and U+0000 in the cursor', () => {
    expect(TaskActivityQuery.schema.safeParse({ limit: '0' }).success).toBe(false);
    expect(TaskActivityQuery.schema.safeParse({ limit: '101' }).success).toBe(false);
    expect(TaskActivityQuery.schema.safeParse({ limit: '100' }).success).toBe(true);
    expect(TaskActivityQuery.schema.safeParse({ cursor: 'a\u0000b' }).success).toBe(false);
  });
});
