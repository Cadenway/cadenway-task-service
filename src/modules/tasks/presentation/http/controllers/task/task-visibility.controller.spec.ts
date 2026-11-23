import 'reflect-metadata';

import { runWithOrganizationContext, ZodValidationPipe } from '@cadenway/nest-common';
import { HEADERS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import type { GetTaskVisibility } from '../../../../application/use-cases/queries/task/get-task-visibility/get-task-visibility.use-case.js';
import { TaskVisibilityBody } from '../../dto/input/task/task-visibility-body.dto.js';
import { TaskVisibilityController } from './task-visibility.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

function asMember<TResult>(work: () => Promise<TResult>): Promise<TResult> {
  return runWithOrganizationContext(
    {
      organizationId: organizationId.toUpperCase(),
      actor: { type: 'user', id: actorUserId.toUpperCase() },
      role: null,
      scopes: [],
    },
    work,
  );
}

function controllerFixture() {
  const execute = vi.fn<GetTaskVisibility['execute']>();
  const controller = new TaskVisibilityController({ execute } as unknown as GetTaskVisibility);
  return { controller, execute };
}

describe('TaskVisibilityController', () => {
  it('requires the gateway user and prevents caching the decision', () => {
    const handler: object = Object.getOwnPropertyDescriptor(
      TaskVisibilityController.prototype,
      'resolve',
    )?.value as object;
    expect(Reflect.getMetadata('cadenway:internal-access', TaskVisibilityController)).toEqual({
      issuers: ['api-gateway'],
      actors: ['user'],
      organization: 'required',
    });
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('visibility');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'private, no-store' },
    ]);
  });

  it('uses the canonical verified tenant and actor and preserves a confirmed refusal as an empty subset', async () => {
    const { controller, execute } = controllerFixture();
    execute.mockResolvedValue({ visibleTaskKeys: [] });

    await expect(asMember(() => controller.resolve({ taskKeys: ['CAD-482'] }))).resolves.toEqual({
      visibleTaskKeys: [],
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      actorUserId,
      taskKeys: ['CAD-482'],
    });
  });

  it('maps an unreliable decision to 503 while preserving 403 for a missing caller', async () => {
    const { controller, execute } = controllerFixture();
    const body = { taskKeys: ['CAD-482'] };
    await expect(controller.resolve(body)).rejects.toMatchObject({
      problem: { status: 403, code: 'auth.actor-not-allowed' },
    });
    expect(execute).not.toHaveBeenCalled();

    execute.mockRejectedValue(new Error('The membership projection is stale.'));
    await expect(asMember(() => controller.resolve(body))).rejects.toMatchObject({
      problem: { status: 503, code: 'task.visibility-unavailable' },
    });
  });

  it('accepts valid task keys and rejects duplicate keys or caller fields in the body', () => {
    const pipe = new ZodValidationPipe();
    const argument = { type: 'body' as const, metatype: TaskVisibilityBody };
    expect(pipe.transform({ taskKeys: ['CAD-482', 'CAD-483'] }, argument)).toEqual({
      taskKeys: ['CAD-482', 'CAD-483'],
    });
    for (const invalid of [
      { taskKeys: ['CAD-482', 'CAD-482'] },
      { taskKeys: ['CAD-482'], organizationId },
      { taskKeys: ['CAD-0'] },
    ]) {
      expect(() => pipe.transform(invalid, argument)).toThrow();
    }
  });
});
