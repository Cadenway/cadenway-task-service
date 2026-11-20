import 'reflect-metadata';

import { runWithOrganizationContext, ZodValidationPipe } from '@cadenway/nest-common';
import { HEADERS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import { SpaceRefusal } from '../../../../application/models/space/space-refusal.model.js';
import type { ResolveDocumentSpaceAccess } from '../../../../application/use-cases/queries/access/resolve-document-space-access/resolve-document-space-access.use-case.js';
import { DocumentSpaceAccessBody } from '../../dto/input/access/document-space-access-body.dto.js';
import { DocumentSpaceAccessController } from './document-space-access.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const userId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const spaceId = '123e4567-e89b-42d3-a456-426614174000';

function asMember<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'user', id: userId }, role: null, scopes: [] },
    work,
  );
}

describe('DocumentSpaceAccessController', () => {
  it('allows only the document service with a user and organization and disables response caching', () => {
    const handler = Object.getOwnPropertyDescriptor(
      DocumentSpaceAccessController.prototype,
      'resolve',
    )?.value as object;
    expect(Reflect.getMetadata('cadenway:internal-access', DocumentSpaceAccessController)).toEqual({
      issuers: ['document-service'],
      actors: ['user'],
      organization: 'required',
    });
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('resolve');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
  });

  it('passes only the verified caller and returns the contracted space roles', async () => {
    const execute = vi.fn<ResolveDocumentSpaceAccess['execute']>().mockResolvedValue({
      results: [{ spaceId, role: 'view' }],
    });
    const controller = new DocumentSpaceAccessController({
      execute,
    } as unknown as ResolveDocumentSpaceAccess);
    await expect(asMember(() => controller.resolve({ spaceIds: [spaceId] }))).resolves.toEqual({
      results: [{ spaceId, role: 'view' }],
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      viewerUserId: userId,
      spaceIds: [spaceId],
    });
  });

  it('delegates an empty lookup so the use case can verify current membership', async () => {
    const execute = vi
      .fn<ResolveDocumentSpaceAccess['execute']>()
      .mockResolvedValue({ results: [] });
    const controller = new DocumentSpaceAccessController({
      execute,
    } as unknown as ResolveDocumentSpaceAccess);
    await expect(asMember(() => controller.resolve({ spaceIds: [] }))).resolves.toEqual({
      results: [],
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      viewerUserId: userId,
      spaceIds: [],
    });
  });

  it('returns the contracted membership and unavailable errors', async () => {
    const execute = vi
      .fn<ResolveDocumentSpaceAccess['execute']>()
      .mockRejectedValue(new SpaceRefusal({ reason: 'organization-not-found' }));
    const controller = new DocumentSpaceAccessController({
      execute,
    } as unknown as ResolveDocumentSpaceAccess);
    await expect(asMember(() => controller.resolve({ spaceIds: [] }))).rejects.toMatchObject({
      problem: { status: 404, code: 'organization.not-found' },
    });
    execute.mockRejectedValue(new Error('unavailable'));
    await expect(asMember(() => controller.resolve({ spaceIds: [] }))).rejects.toMatchObject({
      problem: { status: 503, code: 'task.document-space-access-unavailable' },
    });
  });

  it('uses the generated strict validator and permits zero to one hundred generic UUIDs', () => {
    const pipe = new ZodValidationPipe();
    const metadata = { type: 'body' as const, metatype: DocumentSpaceAccessBody };
    expect(pipe.transform({ spaceIds: [] }, metadata)).toBeDefined();
    expect(pipe.transform({ spaceIds: Array(100).fill(spaceId) }, metadata)).toBeDefined();
    for (const invalid of [
      { spaceIds: Array(101).fill(spaceId) },
      { spaceIds: ['invalid'] },
      { spaceIds: [], organizationId },
      {},
    ]) {
      expect(() => pipe.transform(invalid, metadata)).toThrow();
    }
  });
});
