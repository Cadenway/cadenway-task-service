import { describe, expect, it } from 'vitest';

import { RemoveTaskLabelBody } from './remove-task-label-body.dto.js';

describe('the body of a label removal', () => {
  it('refuses a blank label on name and accepts a label with a character', () => {
    const blank = RemoveTaskLabelBody.schema.safeParse({ name: '  ' });

    expect(blank.success).toBe(false);
    if (!blank.success) {
      expect(blank.error.issues.map((issue) => issue.path)).toEqual([['name']]);
    }
    expect(RemoveTaskLabelBody.schema.safeParse({ name: ' auth ' }).success).toBe(true);
  });
});
