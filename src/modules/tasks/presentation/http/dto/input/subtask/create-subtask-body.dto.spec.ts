import { describe, expect, it } from 'vitest';

import { CreateSubtaskBody } from './create-subtask-body.dto.js';

describe('the body of a subtask creation', () => {
  it('leaves assigneeIds absent so that the subtask can inherit, and applies the other defaults', () => {
    expect(CreateSubtaskBody.schema.parse({ name: 'Relire' })).toStrictEqual({
      name: 'Relire',
      status: 'todo',
      priority: 'moyenne',
      labels: [],
    });
  });

  it('refuses a blank name and a blank label on the member', () => {
    const result = CreateSubtaskBody.schema.safeParse({ name: ' ', labels: ['a', '  '] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([['name'], ['labels', 1]]);
    }
  });
});
