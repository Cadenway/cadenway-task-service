import 'reflect-metadata';

import { runWithOrganizationContext, ZodValidationPipe } from '@cadenway/nest-common';
import { HEADERS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import type { CheckTaskAttachmentAccess } from '../../../../application/use-cases/queries/task/check-task-attachment-access/check-task-attachment-access.use-case.js';
import { TaskAttachmentAccessPath } from '../../dto/input/access/task-attachment-access-path.dto.js';
import { TaskAttachmentAccessQuery } from '../../dto/input/access/task-attachment-access-query.dto.js';
import { TaskAttachmentAccessController } from './task-attachment-access.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

function asMember<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'user', id: actorUserId }, role: null, scopes: [] },
    work,
  );
}

describe('TaskAttachmentAccessController', () => {
  it('restricts the route to the gateway and makes its decisions non-cacheable', () => {
    const handler: object = Object.getOwnPropertyDescriptor(
      TaskAttachmentAccessController.prototype,
      'check',
    )?.value as object;
    expect(Reflect.getMetadata('cadenway:internal-access', TaskAttachmentAccessController)).toEqual(
      {
        issuers: ['api-gateway'],
        actors: ['user'],
        organization: 'required',
      },
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':taskKey/attachment-access');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
  });

  it.each(['read', 'write'] as const)(
    'passes the verified caller and %s mode to the use case',
    async (mode) => {
      const execute = vi.fn<CheckTaskAttachmentAccess['execute']>().mockResolvedValue(undefined);
      const controller = new TaskAttachmentAccessController({
        execute,
      } as unknown as CheckTaskAttachmentAccess);

      await expect(
        asMember(() => controller.check({ taskKey: 'CAD-482' }, { mode })),
      ).resolves.toBeUndefined();
      expect(execute).toHaveBeenCalledExactlyOnceWith({
        organizationId,
        actorUserId,
        taskKey: 'CAD-482',
        mode,
      });
    },
  );

  it.each([
    [{ reason: 'task-not-found' } as const, 404, 'task.not-found'],
    [{ reason: 'organization-not-found' } as const, 404, 'organization.not-found'],
    [{ reason: 'role-insufficient', role: 'view' } as const, 403, 'access.role-insufficient'],
    [{ reason: 'task-archived', key: 'CAD-482' } as const, 409, 'task.archived'],
  ])('maps refusal %o to %s', async (refusal, status, code) => {
    const execute = vi
      .fn<CheckTaskAttachmentAccess['execute']>()
      .mockRejectedValue(new TaskRefusal(refusal));
    const controller = new TaskAttachmentAccessController({
      execute,
    } as unknown as CheckTaskAttachmentAccess);

    await expect(
      asMember(() => controller.check({ taskKey: 'CAD-482' }, { mode: 'write' })),
    ).rejects.toMatchObject({
      problem: { status, code },
    });
  });

  it('validates the path and requires a single recognized query mode', () => {
    const pipe = new ZodValidationPipe();
    const path = { type: 'param' as const, metatype: TaskAttachmentAccessPath };
    const query = { type: 'query' as const, metatype: TaskAttachmentAccessQuery };

    expect(pipe.transform({ taskKey: 'CAD-482' }, path)).toEqual({ taskKey: 'CAD-482' });
    expect(pipe.transform({ mode: 'read' }, query)).toEqual({ mode: 'read' });
    expect(() => pipe.transform({ taskKey: 'invalid' }, path)).toThrow();
    for (const invalid of [
      {},
      { mode: 'delete' },
      { mode: ['read', 'write'] },
      { mode: 'read', extra: 'x' },
    ]) {
      expect(() => pipe.transform(invalid, query)).toThrow();
    }
  });
});
