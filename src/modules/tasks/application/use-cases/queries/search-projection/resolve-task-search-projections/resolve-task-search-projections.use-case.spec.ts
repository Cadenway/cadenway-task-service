import { describe, expect, it, vi } from 'vitest';

import type { SearchProjectionReader } from '../../../../ports/outbound/persistence/search-projection/search-projection-reader.port.js';
import type { SearchProjection } from '../../../../projections/search-projection/search-projection.projection.js';
import { ResolveTaskSearchProjections } from './resolve-task-search-projections.use-case.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const liveId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const inactiveId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';
const missingId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e04';
const active: SearchProjection = {
  kind: 'space',
  id: liveId,
  version: 7,
  name: 'Place',
  lifecycle: 'active',
};

function source() {
  return {
    page: vi.fn<SearchProjectionReader['page']>(),
    resolve: vi.fn<SearchProjectionReader['resolve']>(),
  };
}

describe('ResolveTaskSearchProjections', () => {
  it('keeps request order and source versions for inactive records', async () => {
    const reader = source();
    reader.resolve.mockResolvedValue([
      { id: liveId, rowId: liveId, version: active.version, projection: active },
      { id: inactiveId, rowId: inactiveId, version: 8, projection: null },
    ]);
    const ids = [inactiveId.toUpperCase(), missingId, liveId];
    const result = await new ResolveTaskSearchProjections(reader).execute({
      organizationId,
      kind: 'space',
      ids,
    });

    expect(reader.resolve).toHaveBeenCalledExactlyOnceWith(organizationId, 'space', [
      inactiveId,
      missingId,
      liveId,
    ]);
    expect(result).toEqual({
      outcome: 'resolved',
      results: [
        { status: 'absent', id: inactiveId, version: 8 },
        { status: 'absent', id: missingId, version: null },
        { status: 'present', projection: active },
      ],
    });
  });

  it('detects duplicate UUIDs after normalization before consulting persistence', async () => {
    const reader = source();
    const ids = [liveId.toUpperCase(), liveId];
    expect(
      await new ResolveTaskSearchProjections(reader).execute({
        organizationId,
        kind: 'space',
        ids,
      }),
    ).toEqual({ outcome: 'duplicate-ids' });
    expect(reader.resolve).not.toHaveBeenCalled();
  });

  it('provides no partial decisions when the aggregate response exceeds the UTF-8 cap', async () => {
    const reader = source();
    const projection = { ...active, name: '😀'.repeat(270_000) };
    reader.resolve.mockResolvedValue([
      { id: liveId, rowId: liveId, version: active.version, projection },
    ]);
    expect(
      await new ResolveTaskSearchProjections(reader).execute({
        organizationId,
        kind: 'space',
        ids: [liveId],
      }),
    ).toEqual({ outcome: 'batch-too-large' });
  });
});
