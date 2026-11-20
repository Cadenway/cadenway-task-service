import { describe, expect, it, vi } from 'vitest';

import type { DocumentSpaceAccessStore } from '../../../../models/access/document-space-access-store.model.js';
import type { DocumentSpaceAccessUnitOfWork } from '../../../../ports/outbound/transactions/access/document-space-access-unit-of-work.port.js';
import { ResolveDocumentSpaceAccess } from './resolve-document-space-access.use-case.js';

const organizationId = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12';
const viewerUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const design = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const product = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const hidden = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';

function fixture() {
  const store = {
    findViewer: vi.fn().mockResolvedValue({ role: 'member' }),
    resolveSpaces: vi.fn().mockResolvedValue([
      { id: product.toUpperCase(), role: 'view' },
      { id: design, role: 'edit' },
    ]),
  } satisfies DocumentSpaceAccessStore;
  const unitOfWork: DocumentSpaceAccessUnitOfWork = {
    read: (work) => work(store),
  };
  return { store, operation: new ResolveDocumentSpaceAccess(unitOfWork) };
}

describe('ResolveDocumentSpaceAccess', () => {
  it('returns direct roles once in first-request order and omits inaccessible spaces', async () => {
    const { store, operation } = fixture();
    await expect(
      operation.execute({
        organizationId,
        viewerUserId,
        spaceIds: [design.toUpperCase(), hidden, product, design],
      }),
    ).resolves.toEqual({
      results: [
        { spaceId: design, role: 'edit' },
        { spaceId: product, role: 'view' },
      ],
    });
    expect(store.findViewer).toHaveBeenCalledWith({ organizationId, userId: viewerUserId });
    expect(store.resolveSpaces).toHaveBeenCalledWith({
      organizationId,
      viewerUserId,
      viewerRole: 'member',
      spaceIds: [design, hidden, product],
    });
  });

  it('checks active membership for an empty catalog without querying spaces', async () => {
    const { store, operation } = fixture();
    await expect(
      operation.execute({ organizationId, viewerUserId, spaceIds: [] }),
    ).resolves.toEqual({
      results: [],
    });
    expect(store.findViewer).toHaveBeenCalledOnce();
    expect(store.resolveSpaces).not.toHaveBeenCalled();
  });

  it('refuses an absent membership even when the catalog is empty', async () => {
    const { store, operation } = fixture();
    vi.mocked(store.findViewer).mockResolvedValue(null);
    await expect(
      operation.execute({ organizationId, viewerUserId, spaceIds: [] }),
    ).rejects.toMatchObject({
      refusal: { reason: 'organization-not-found' },
    });
    expect(store.resolveSpaces).not.toHaveBeenCalled();
  });

  it('uses the projected current role for the canonical policy', async () => {
    const { store, operation } = fixture();
    vi.mocked(store.findViewer).mockResolvedValue({ role: 'guest' });
    vi.mocked(store.resolveSpaces).mockResolvedValue([]);
    await expect(
      operation.execute({ organizationId, viewerUserId, spaceIds: [design] }),
    ).resolves.toEqual({
      results: [],
    });
    expect(store.resolveSpaces).toHaveBeenCalledWith(
      expect.objectContaining({ viewerRole: 'guest' }),
    );
  });

  it('propagates a failed authorization snapshot without partial results', async () => {
    const { store, operation } = fixture();
    const failure = new Error('Snapshot unavailable');
    vi.mocked(store.resolveSpaces).mockRejectedValue(failure);
    await expect(
      operation.execute({ organizationId, viewerUserId, spaceIds: [design] }),
    ).rejects.toBe(failure);
  });
});
