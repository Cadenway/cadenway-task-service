import { describe, expect, it } from 'vitest';

import { DuplicateListBody } from './duplicate-list-body.dto.js';
import { DuplicateListPath } from './duplicate-list-path.dto.js';

describe('the list duplicate input', () => {
  it('accepts only the empty object required by the contract', () => {
    expect(DuplicateListBody.schema.safeParse({}).success).toBe(true);
    expect(DuplicateListBody.schema.safeParse({ copy: true }).success).toBe(false);
    expect(DuplicateListBody.schema.safeParse(undefined).success).toBe(false);
    expect(DuplicateListBody.schema.safeParse([]).success).toBe(false);
  });

  it('requires a UUID list id', () => {
    expect(
      DuplicateListPath.schema.safeParse({ listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12' })
        .success,
    ).toBe(true);
    expect(DuplicateListPath.schema.safeParse({ listId: 'invalid' }).success).toBe(false);
  });
});
