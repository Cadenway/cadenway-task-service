import 'reflect-metadata';

import { runWithOrganizationContext, ZodValidationPipe } from '@cadenway/nest-common';
import { HEADERS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import type { ResolveTaskSearchAccess } from '../../../../application/use-cases/queries/search-access/resolve-task-search-access/resolve-task-search-access.use-case.js';
import { TaskSearchAccessBody } from '../../dto/input/search-access/task-search-access-body.dto.js';
import { TaskSearchAccessController } from './task-search-access.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const userId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const spaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const membership = {
  memberId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03',
  version: 4,
  role: 'guest',
} as const;
const space = { kind: 'space', id: spaceId } as const;
const body = { membership, candidates: [space] };

function asMember<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'user', id: userId }, role: null, scopes: [] },
    work,
  );
}

describe('TaskSearchAccessController', () => {
  it('requires a signed Search user and organization and returns a private uncached response', () => {
    const handler = Object.getOwnPropertyDescriptor(TaskSearchAccessController.prototype, 'resolve')
      ?.value as object;
    expect(Reflect.getMetadata('cadenway:internal-access', TaskSearchAccessController)).toEqual({
      issuers: ['search-service'],
      actors: ['user'],
      organization: 'required',
    });
    expect(Reflect.getMetadata(PATH_METADATA, TaskSearchAccessController)).toBe(
      'internal/v1/task-search-access',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('resolve');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'private, no-store' },
    ]);
  });

  it('passes the verified actor and returns only contracted access evidence', async () => {
    const proof = { ...space, version: 5, directSpace: false, name: 'Search display text' };
    const execute = vi
      .fn<ResolveTaskSearchAccess['execute']>()
      .mockResolvedValue({ results: [proof] });
    const controller = new TaskSearchAccessController({
      execute,
    } as unknown as ResolveTaskSearchAccess);

    await expect(asMember(() => controller.resolve(body))).resolves.toEqual({
      results: [{ ...space, version: 5, directSpace: false }],
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      actorUserId: userId,
      ...body,
    });
  });

  it('fails closed when membership differs or proof resolution is unavailable', async () => {
    const execute = vi.fn<ResolveTaskSearchAccess['execute']>().mockResolvedValue(null);
    const controller = new TaskSearchAccessController({
      execute,
    } as unknown as ResolveTaskSearchAccess);
    const error = { problem: { status: 503, code: 'task.search-access-unavailable' } };

    await expect(asMember(() => controller.resolve(body))).rejects.toMatchObject(error);
    execute.mockRejectedValue(new Error('Unavailable'));
    await expect(asMember(() => controller.resolve(body))).rejects.toMatchObject(error);
  });
});

describe('TaskSearchAccessBody', () => {
  const pipe = new ZodValidationPipe();
  const metadata = { type: 'body' as const, metatype: TaskSearchAccessBody };

  it('accepts empty and full batches and normalizes UUIDs', () => {
    const candidates = Array.from({ length: 100 }, (_, index) => ({
      kind: 'list',
      id: `019A7000-1A2B-7C3D-8E4F-${String(index).padStart(12, '0')}`,
    }));
    expect(pipe.transform({ membership, candidates: [] }, metadata)).toEqual({
      membership,
      candidates: [],
    });
    expect(
      pipe.transform(
        { membership: { ...membership, memberId: membership.memberId.toUpperCase() }, candidates },
        metadata,
      ),
    ).toEqual({
      membership,
      candidates: candidates.map((value) => ({ ...value, id: value.id.toLowerCase() })),
    });
    expect(() =>
      pipe.transform({ membership, candidates: [...candidates, space] }, metadata),
    ).toThrow();
  });

  it('rejects unknown properties and duplicate canonical candidates', () => {
    for (const input of [
      { ...body, organizationId },
      { ...body, membership: { ...membership, userId } },
      { ...body, candidates: [{ ...space, directSpace: true }] },
      { ...body, candidates: [space, { ...space, id: space.id.toUpperCase() }] },
    ]) {
      expect(() => pipe.transform(input, metadata)).toThrow();
    }
  });
});
