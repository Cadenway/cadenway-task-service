import { describe, expect, it } from 'vitest';

import { CreateTaskTemplateBody } from './create-task-template-body.dto.js';

const SOURCE = { sourceTaskKey: 'CAD-123' };

describe('CreateTaskTemplateBody', () => {
  it.each(['\u0000', '\uD800', '\uDFFF'])('reports invalid text on name', (character) => {
    const result = CreateTaskTemplateBody.schema.safeParse({
      ...SOURCE,
      name: `Release ${character} checklist`,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([['name']]);
    }
  });

  it('preserves a valid supplementary character and accepts an omitted name', () => {
    const body = { ...SOURCE, name: 'Release 🚀 checklist' };

    expect(CreateTaskTemplateBody.schema.parse(body)).toEqual(body);
    expect(CreateTaskTemplateBody.schema.parse(SOURCE)).toEqual(SOURCE);
  });
});
