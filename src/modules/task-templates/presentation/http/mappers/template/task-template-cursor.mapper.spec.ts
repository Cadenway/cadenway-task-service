import { describe, expect, it } from 'vitest';

import { decodeTemplateCursor, encodeTemplateCursor } from './task-template-cursor.mapper.js';

const CALLER = {
  organizationId: '019a7001-1a2b-7c3d-8e4f-5a6b7c8d9e01',
  spaceId: '019a7002-1a2b-7c3d-8e4f-5a6b7c8d9e01',
  actorUserId: '019a7003-1a2b-7c3d-8e4f-5a6b7c8d9e01',
};
const POSITION = {
  createdAt: '2026-10-12T20:18:07.018Z',
  id: '019a7004-1a2b-7c3d-8e4f-5a6b7c8d9e01',
};

describe('Task template cursor', () => {
  it('round-trips the timestamp and id for the same library', () => {
    expect(decodeTemplateCursor(undefined, CALLER)).toBeNull();
    expect(decodeTemplateCursor(encodeTemplateCursor(POSITION, CALLER), CALLER)).toEqual(POSITION);
  });

  it('does not accept a cursor issued to another library or an invalid stored instant', () => {
    const cursor = encodeTemplateCursor(POSITION, CALLER);
    const other = { ...CALLER, spaceId: '019a7005-1a2b-7c3d-8e4f-5a6b7c8d9e01' };
    expect(() => decodeTemplateCursor(cursor, other)).toThrow();
    const invalid = encodeTemplateCursor(
      { ...POSITION, createdAt: '2026-02-30T00:00:00.000Z' },
      CALLER,
    );
    expect(() => decodeTemplateCursor(invalid, CALLER)).toThrow();
  });
});
