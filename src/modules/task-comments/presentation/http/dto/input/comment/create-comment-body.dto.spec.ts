import { describe, expect, it } from 'vitest';
import { CreateCommentBody } from './create-comment-body.dto.js';

describe('create comment body', () => {
  it('accepts up to 5000 Unicode code points and rejects blank or oversized Markdown', () => {
    expect(CreateCommentBody.schema.safeParse({ body: '😀'.repeat(5000) }).success).toBe(true);
    expect(CreateCommentBody.schema.safeParse({ body: '😀'.repeat(5001) }).success).toBe(false);
    expect(CreateCommentBody.schema.safeParse({ body: '  \n' }).success).toBe(false);
    expect(CreateCommentBody.schema.safeParse({ body: 'x\0' }).success).toBe(false);
  });

  it('accepts structurally valid mentions for semantic validation in the use case', () => {
    expect(
      CreateCommentBody.schema.safeParse({
        body: '@Camille',
        mentions: [{ userId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30', start: 0, end: 8 }],
      }).success,
    ).toBe(true);
  });
});
