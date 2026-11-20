import { describe, expect, it } from 'vitest';

import type { SearchProjectionScope } from '../../../application/models/search-projection/search-projection-scope.model.js';
import { AesSearchProjectionCursor } from './aes-search-projection-cursor.adapter.js';

const tenant = '019a7000-0000-7000-8000-000000000001';
const spaceId = '019a7000-0000-7000-8000-000000000002';
const listId = '019a7000-0000-7000-8000-000000000003';
const bounds = {
  afterId: '019a7000-0000-4000-8000-000000000004',
  upperId: '019a7000-0000-7000-8000-000000000005',
};
const scope: SearchProjectionScope = { kind: 'task', spaceId, listId };

describe('AesSearchProjectionCursor', () => {
  it('keeps task row UUIDs opaque and reads continuations across replicas with the same key', () => {
    const key = Buffer.alloc(32, 1);
    const cursor = new AesSearchProjectionCursor(key).encode(tenant, scope, bounds);
    expect(Buffer.from(cursor, 'base64url').includes(bounds.afterId)).toBe(false);
    expect(new AesSearchProjectionCursor(key).decode(tenant, scope, cursor)).toEqual(bounds);
  });

  it('rejects tampering and refuses to carry a cursor across its tenant, filters or kind', () => {
    const codec = new AesSearchProjectionCursor(Buffer.alloc(32, 1));
    const cursor = codec.encode(tenant, scope, bounds);
    const changed = cursor.startsWith('a') ? 'b' : 'a';

    expect(codec.decode(tenant, scope, changed + cursor.slice(1))).toBeNull();
    expect(codec.decode(spaceId, scope, cursor)).toBeNull();
    expect(codec.decode(tenant, { ...scope, spaceId: null }, cursor)).toBeNull();
    expect(codec.decode(tenant, { ...scope, listId: null }, cursor)).toBeNull();
    expect(codec.decode(tenant, { ...scope, kind: 'list' }, cursor)).toBeNull();
  });
});
