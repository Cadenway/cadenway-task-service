import { describe, expect, it } from 'vitest';

import { AddTaskLabelBody } from './add-task-label-body.dto.js';

describe('the body of a label addition', () => {
  it('refuses a blank label on name', () => {
    const result = AddTaskLabelBody.schema.safeParse({ name: '  ' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([['name']]);
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        'Expected a label with a character other than a space',
      ]);
    }
  });

  it('accepts a label of 32 characters and refuses 33', () => {
    expect(AddTaskLabelBody.schema.safeParse({ name: 'a'.repeat(32) }).success).toBe(true);
    expect(AddTaskLabelBody.schema.safeParse({ name: 'a'.repeat(33) }).success).toBe(false);
  });
});
