import 'reflect-metadata';

import { runWithOrganizationContext, ZodValidationPipe } from '@cadenway/nest-common';
import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import type { SearchProjectionReader } from '../../../../application/ports/outbound/persistence/search-projection/search-projection-reader.port.js';
import type { SearchProjection } from '../../../../application/projections/search-projection/search-projection.projection.js';
import { ListTaskSearchProjections } from '../../../../application/use-cases/queries/search-projection/list-task-search-projections/list-task-search-projections.use-case.js';
import { ResolveTaskSearchProjections } from '../../../../application/use-cases/queries/search-projection/resolve-task-search-projections/resolve-task-search-projections.use-case.js';
import { TaskSearchProjectionLookup } from '../../dto/input/search-projection/task-search-projection-lookup.dto.js';
import { TaskSearchProjectionQuery } from '../../dto/input/search-projection/task-search-projection-query.dto.js';
import { TaskSearchProjectionActorGuard } from '../../guards/search-projection/task-search-projection-actor.guard.js';
import { TaskSearchProjectionController } from './task-search-projection.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const listId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const spaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';

function asSearch<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'system', id: 'search-service' }, role: null, scopes: [] },
    work,
  );
}

function verifiedActor(id: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ internalPrincipal: { actor: { type: 'system', id } } }),
    }),
  } as unknown as ExecutionContext;
}

describe('TaskSearchProjectionController', () => {
  it('requires the Search issuer, system actor identity and signed tenant', () => {
    expect(Reflect.getMetadata('cadenway:internal-access', TaskSearchProjectionController)).toEqual(
      {
        issuers: ['search-service'],
        actors: ['system'],
        organization: 'required',
      },
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, TaskSearchProjectionController)).toEqual([
      TaskSearchProjectionActorGuard,
    ]);
    const guard = new TaskSearchProjectionActorGuard();
    expect(guard.canActivate(verifiedActor('search-service'))).toBe(true);
    expect(() => guard.canActivate(verifiedActor('document-service'))).toThrow();
  });

  it('validates the published ID namespace and placement rules through the HTTP pipe', () => {
    const pipe = new ZodValidationPipe();
    const query = { type: 'query' as const, metatype: TaskSearchProjectionQuery };
    const body = { type: 'body' as const, metatype: TaskSearchProjectionLookup };

    expect(pipe.transform({ kind: 'task', listId }, query)).toEqual({
      kind: 'task',
      listId,
      limit: 50,
    });
    expect(() => pipe.transform({ kind: 'list', listId }, query)).toThrow();
    expect(() => pipe.transform({ kind: 'space', spaceId: listId }, query)).toThrow();
    expect(() => pipe.transform({ kind: 'task', ids: [listId] }, body)).toThrow();
    expect(() => pipe.transform({ kind: 'list', ids: ['CAD-22'] }, body)).toThrow();
    expect(() => pipe.transform({ kind: 'list', ids: [listId], organizationId }, body)).toThrow();
    expect(pipe.transform({ kind: 'task', ids: ['CAD-22'] }, body)).toEqual({
      kind: 'task',
      ids: ['CAD-22'],
    });
  });

  it('uses the signed tenant for lookup even when enumeration is unavailable', async () => {
    const source = {
      page: vi.fn<SearchProjectionReader['page']>(),
      resolve: vi.fn<SearchProjectionReader['resolve']>().mockResolvedValue([]),
    };
    const controller = new TaskSearchProjectionController(
      new ListTaskSearchProjections(source, null),
      new ResolveTaskSearchProjections(source),
    );
    await asSearch(async () => {
      await expect(controller.list({ kind: 'list', limit: 20 })).rejects.toMatchObject({
        problem: { status: 503, code: 'task.projection-unavailable' },
      });
      await expect(
        controller.resolve({ kind: 'list', ids: [listId.toUpperCase()] }),
      ).resolves.toEqual({
        results: [{ status: 'absent', id: listId, version: null }],
      });
    });
    expect(source.page).not.toHaveBeenCalled();
    expect(source.resolve).toHaveBeenCalledExactlyOnceWith(organizationId, 'list', [listId]);
  });

  const active = { version: 2, lifecycle: 'active' } as const;
  const unicodeBoundary: readonly SearchProjection[] = [
    {
      ...active,
      kind: 'task',
      id: 'CAD-2',
      status: 'todo',
      name: '😀'.repeat(300),
      listId,
      spaceId,
    },
    { ...active, kind: 'list', id: listId, name: '😀'.repeat(80), spaceId },
    { ...active, kind: 'space', id: spaceId, name: '😀'.repeat(80) },
  ];
  it.each(unicodeBoundary)(
    'returns the published Unicode name boundary in both $kind routes',
    async (projection) => {
      const row = { rowId: listId, id: projection.id, version: projection.version, projection };
      const source = {
        page: vi
          .fn<SearchProjectionReader['page']>()
          .mockResolvedValue({ upperId: row.rowId, entries: [row] }),
        resolve: vi.fn<SearchProjectionReader['resolve']>().mockResolvedValue([row]),
      };
      const cursor = { encode: vi.fn(), decode: vi.fn() };
      const controller = new TaskSearchProjectionController(
        new ListTaskSearchProjections(source, cursor),
        new ResolveTaskSearchProjections(source),
      );
      await asSearch(async () => {
        await expect(controller.list({ kind: projection.kind, limit: 50 })).resolves.toEqual({
          items: [projection],
          nextCursor: null,
        });
        await expect(
          controller.resolve({ kind: projection.kind, ids: [projection.id] }),
        ).resolves.toEqual({
          results: [{ status: 'present', projection }],
        });
      });
    },
  );
});
