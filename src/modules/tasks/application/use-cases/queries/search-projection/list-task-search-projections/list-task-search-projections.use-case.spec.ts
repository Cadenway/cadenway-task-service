import { describe, expect, it, vi } from 'vitest';

import type { SearchProjectionScope } from '../../../../models/search-projection/search-projection-scope.model.js';
import type { SearchProjectionCursor } from '../../../../ports/outbound/pagination/search-projection/search-projection-cursor.port.js';
import type { SearchProjectionReader } from '../../../../ports/outbound/persistence/search-projection/search-projection-reader.port.js';
import type { SearchProjectionEntry } from '../../../../projections/search-projection/search-projection-entry.projection.js';
import { ListTaskSearchProjections } from './list-task-search-projections.use-case.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const scope: SearchProjectionScope = { kind: 'space', spaceId: null, listId: null };
const firstId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const secondId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';
const upperId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e04';

function space(rowId: string, name: string): SearchProjectionEntry {
  return { rowId, projection: { kind: 'space', id: rowId, name, version: 1, lifecycle: 'active' } };
}

function sources() {
  const reader = {
    page: vi.fn<SearchProjectionReader['page']>(),
    resolve: vi.fn<SearchProjectionReader['resolve']>(),
  };
  const codec = {
    encode: vi.fn<SearchProjectionCursor['encode']>().mockReturnValue('sealed'),
    decode: vi.fn<SearchProjectionCursor['decode']>().mockReturnValue(null),
  };
  return { reader, codec };
}

describe('ListTaskSearchProjections', () => {
  it('refuses disabled or invalid continuations before querying the tenant', async () => {
    const { reader, codec } = sources();
    const input = { organizationId, scope, limit: 2, cursor: 'wrong' };
    expect(await new ListTaskSearchProjections(reader, null).execute(input)).toEqual({
      outcome: 'unavailable',
    });
    expect(await new ListTaskSearchProjections(reader, codec).execute(input)).toEqual({
      outcome: 'invalid-cursor',
    });
    expect(reader.page).not.toHaveBeenCalled();
  });

  it('caps the UTF-8 response and advances only past the last emitted item', async () => {
    const { reader, codec } = sources();
    const first = space(firstId, '😀'.repeat(150_000));
    const second = space(secondId, '😀'.repeat(150_000));
    reader.page.mockResolvedValue({ upperId, entries: [first, second] });
    const result = await new ListTaskSearchProjections(reader, codec).execute({
      organizationId,
      scope,
      limit: 3,
      cursor: null,
    });

    expect(result).toEqual({ outcome: 'page', items: [first.projection], nextCursor: 'sealed' });
    expect(codec.encode).toHaveBeenCalledExactlyOnceWith(organizationId, scope, {
      afterId: firstId,
      upperId,
    });
  });

  it('keeps the original upper fence and marks actual exhaustion', async () => {
    const { reader, codec } = sources();
    const bounds = { afterId: firstId, upperId };
    const entry = space(secondId, 'Place');
    codec.decode.mockReturnValue(bounds);
    reader.page.mockResolvedValue({ upperId, entries: [entry] });
    const result = await new ListTaskSearchProjections(reader, codec).execute({
      organizationId,
      scope,
      limit: 1,
      cursor: 'sealed',
    });

    expect(reader.page).toHaveBeenCalledExactlyOnceWith(organizationId, scope, bounds, 1);
    expect(result).toEqual({ outcome: 'page', items: [entry.projection], nextCursor: null });
  });
});
