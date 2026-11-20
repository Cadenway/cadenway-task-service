import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { CreateSpaceCustomField } from '../../../../application/use-cases/commands/custom-field/create-space-custom-field/create-space-custom-field.use-case.js';
import { CustomFieldRefusal } from '../../../../application/models/custom-field/custom-field-refusal.model.js';
import { CustomFieldReplayAccessGuard } from './custom-field-replay-access.guard.js';

const spaceId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

function context(key: string | undefined, id: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { 'idempotency-key': key },
        params: { spaceId: id },
        internalPrincipal: {
          organizationId: spaceId,
          actor: { type: 'user', id: actorUserId },
          role: null,
          scopes: [],
          issuer: 'api-gateway',
          audience: 'task-service',
          traceId: null,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('custom field replay access', () => {
  it('checks current management using the verified principal without a pre-existing context', async () => {
    const assertCanReplay = vi.fn().mockResolvedValue(undefined);
    const guard = new CustomFieldReplayAccessGuard({
      assertCanReplay,
    } as unknown as CreateSpaceCustomField);
    await expect(guard.canActivate(context('key', spaceId))).resolves.toBe(true);
    expect(assertCanReplay).toHaveBeenCalledWith({ organizationId: spaceId, actorUserId, spaceId });
  });

  it('refuses replay after management permission is removed', async () => {
    const assertCanReplay = vi.fn().mockRejectedValue(new CustomFieldRefusal('manage-forbidden'));
    const guard = new CustomFieldReplayAccessGuard({
      assertCanReplay,
    } as unknown as CreateSpaceCustomField);
    await expect(guard.canActivate(context('key', spaceId))).rejects.toMatchObject({
      problem: { status: 403, code: 'space.manage-forbidden' },
    });
  });

  it('leaves requests without a key or with an invalid path to the ordinary handler', async () => {
    const assertCanReplay = vi.fn();
    const guard = new CustomFieldReplayAccessGuard({
      assertCanReplay,
    } as unknown as CreateSpaceCustomField);
    await expect(guard.canActivate(context(undefined, spaceId))).resolves.toBe(true);
    await expect(guard.canActivate(context('key', 'invalid'))).resolves.toBe(true);
    expect(assertCanReplay).not.toHaveBeenCalled();
  });
});
