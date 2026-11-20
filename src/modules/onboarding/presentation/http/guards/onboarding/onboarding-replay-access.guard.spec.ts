import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { OnboardingRefusal } from '../../../../application/models/onboarding/onboarding-refusal.model.js';
import type { FinishOnboarding } from '../../../../application/use-cases/commands/onboarding/finish-onboarding/finish-onboarding.use-case.js';
import { OnboardingReplayAccessGuard } from './onboarding-replay-access.guard.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

function context(key: string | undefined, userId: string, ifMatch?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { 'idempotency-key': key, 'if-match': ifMatch },
        params: { userId },
        internalPrincipal: {
          organizationId,
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

describe('onboarding replay access', () => {
  it('rejects malformed If-Match before replay while accepting a valid stale version', async () => {
    const assertCanReplay = vi.fn().mockResolvedValue(undefined);
    const guard = new OnboardingReplayAccessGuard({
      assertCanReplay,
    } as unknown as FinishOnboarding);
    await expect(guard.canActivate(context('key', actorUserId, '**'))).rejects.toMatchObject({
      problem: { status: 400, code: 'request.invalid' },
    });
    expect(assertCanReplay).not.toHaveBeenCalled();
    expect(await guard.canActivate(context('key', actorUserId, '"1"'))).toBe(true);
    expect(assertCanReplay).toHaveBeenCalledOnce();
  });

  it('checks the verified actor and target user before replay', async () => {
    const assertCanReplay = vi.fn().mockResolvedValue(undefined);
    const guard = new OnboardingReplayAccessGuard({
      assertCanReplay,
    } as unknown as FinishOnboarding);
    expect(await guard.canActivate(context('key', actorUserId))).toBe(true);
    expect(assertCanReplay).toHaveBeenCalledWith({
      organizationId,
      actorUserId,
      userId: actorUserId,
    });
  });

  it('leaves ordinary and malformed paths to the route validation', async () => {
    const assertCanReplay = vi.fn();
    const guard = new OnboardingReplayAccessGuard({
      assertCanReplay,
    } as unknown as FinishOnboarding);
    expect(await guard.canActivate(context(undefined, actorUserId))).toBe(true);
    expect(await guard.canActivate(context('key', 'bad'))).toBe(true);
    expect(assertCanReplay).not.toHaveBeenCalled();
  });

  it('refuses a replay after a member becomes a guest', async () => {
    const assertCanReplay = vi.fn().mockRejectedValue(new OnboardingRefusal('role-forbidden'));
    const guard = new OnboardingReplayAccessGuard({
      assertCanReplay,
    } as unknown as FinishOnboarding);
    await expect(guard.canActivate(context('key', actorUserId))).rejects.toMatchObject({
      problem: { status: 403, code: 'organization.role-forbidden' },
    });
  });
});
