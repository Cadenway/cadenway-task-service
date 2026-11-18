import { describe, expect, it } from 'vitest';

import { AddChecklistItemBody } from './add-checklist-item-body.dto.js';

describe('the body of a checklist item addition', () => {
  it('refuses a text made only of spaces on text, without quoting it', () => {
    const result = AddChecklistItemBody.schema.safeParse({ text: '   ' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([['text']]);
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        'Expected a text with a character other than a space',
      ]);
    }
  });

  it('accepts a text of 300 characters and refuses 301', () => {
    expect(AddChecklistItemBody.schema.safeParse({ text: 'a'.repeat(300) }).success).toBe(true);
    expect(AddChecklistItemBody.schema.safeParse({ text: 'a'.repeat(301) }).success).toBe(false);
  });
});
