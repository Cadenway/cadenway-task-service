import { describe, expect, it } from 'vitest';

import { DuplicateTaskBody } from './duplicate-task-body.dto.js';

describe('the task duplicate body', () => {
  it('accepts only the empty object required by the contract', () => {
    expect(DuplicateTaskBody.schema.safeParse({}).success).toBe(true);
    expect(DuplicateTaskBody.schema.safeParse({ copy: true }).success).toBe(false);
    expect(DuplicateTaskBody.schema.safeParse(undefined).success).toBe(false);
    expect(DuplicateTaskBody.schema.safeParse([]).success).toBe(false);
  });
});
