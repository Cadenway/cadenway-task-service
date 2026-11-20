import { describe, expect, it } from 'vitest';
import { CreateCustomFieldBody } from './create-custom-field-body.dto.js';

describe('custom field creation body', () => {
  it('requires a contract type and a storable name', () => {
    expect(CreateCustomFieldBody.schema.safeParse({ name: 'Points', type: 'number' }).success).toBe(
      true,
    );
    expect(CreateCustomFieldBody.schema.safeParse({ name: 'Points', type: 'choice' }).success).toBe(
      false,
    );
    expect(CreateCustomFieldBody.schema.safeParse({ name: 'A\u0000B', type: 'text' }).success).toBe(
      false,
    );
    expect(CreateCustomFieldBody.schema.safeParse({ name: '\ud800', type: 'text' }).success).toBe(
      false,
    );
    expect(CreateCustomFieldBody.schema.safeParse({ name: '😀', type: 'text' }).success).toBe(true);
  });
});
