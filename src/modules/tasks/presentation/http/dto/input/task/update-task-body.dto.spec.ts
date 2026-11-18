import { describe, expect, it } from 'vitest';

import { UpdateTaskBody } from './update-task-body.dto.js';

describe('the body of a task patch', () => {
  it('keeps a member left out absent and a member sent as null', () => {
    expect(UpdateTaskBody.schema.parse({})).toStrictEqual({});
    expect(UpdateTaskBody.schema.parse({ description: null, parentKey: null })).toStrictEqual({
      description: null,
      parentKey: null,
    });
  });

  it('refuses a blank name on name', () => {
    const result = UpdateTaskBody.schema.safeParse({ name: '  ' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([['name']]);
    }
  });

  it('refuses a null name, a key of another shape and U+0000 in the description', () => {
    expect(UpdateTaskBody.schema.safeParse({ name: null }).success).toBe(false);
    expect(UpdateTaskBody.schema.safeParse({ parentKey: 'cad-12' }).success).toBe(false);
    expect(UpdateTaskBody.schema.safeParse({ description: 'a\u0000' }).success).toBe(false);
  });

  it('refuses a description of more than 50,000 characters and accepts 50,000', () => {
    expect(UpdateTaskBody.schema.safeParse({ description: 'a'.repeat(50000) }).success).toBe(true);
    expect(UpdateTaskBody.schema.safeParse({ description: 'a'.repeat(50001) }).success).toBe(false);
  });
});
