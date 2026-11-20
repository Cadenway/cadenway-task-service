import { describe, expect, it } from 'vitest';
import { decodeCommentCursor, encodeCommentCursor } from './comment-cursor.mapper.js';

describe('comment cursor', () => {
  it('round trips the page position for its task and tenant', () => {
    const position = {
      createdAt: new Date('2026-11-08T10:40:00.000Z'),
      id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
    };
    const cursor = encodeCommentCursor(position, 'CAD-482', 'org');
    expect(cursor).not.toBeNull();
    expect(decodeCommentCursor(cursor ?? undefined, 'CAD-482', 'org')).toEqual(position);
    expect(() => decodeCommentCursor(cursor ?? undefined, 'CAD-483', 'org')).toThrow();
    expect(() => decodeCommentCursor(cursor ?? undefined, 'CAD-482', 'other')).toThrow();
  });
});
