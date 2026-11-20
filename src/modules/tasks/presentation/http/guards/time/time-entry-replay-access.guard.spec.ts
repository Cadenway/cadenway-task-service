import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { CreateTaskTimeEntry } from '../../../../application/use-cases/commands/time/create-task-time-entry/create-task-time-entry.use-case.js';
import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import { TimeEntryReplayAccessGuard } from './time-entry-replay-access.guard.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

function context(key: string | undefined, taskKey: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { 'idempotency-key': key },
        params: { taskKey },
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

describe('time entry replay access', () => {
  it('checks current access before a keyed request reaches idempotency replay', async () => {
    const assertCanReplay = vi.fn().mockResolvedValue(undefined);
    const guard = new TimeEntryReplayAccessGuard({
      assertCanReplay,
    } as unknown as CreateTaskTimeEntry);
    expect(await guard.canActivate(context('key', 'CAD-482'))).toBe(true);
    expect(assertCanReplay).toHaveBeenCalledWith({
      organizationId,
      actorUserId,
      taskKey: 'CAD-482',
    });
  });

  it('allows ordinary handling without a key or with an invalid task path', async () => {
    const assertCanReplay = vi.fn();
    const guard = new TimeEntryReplayAccessGuard({
      assertCanReplay,
    } as unknown as CreateTaskTimeEntry);
    expect(await guard.canActivate(context(undefined, 'CAD-482'))).toBe(true);
    expect(await guard.canActivate(context('key', 'bad'))).toBe(true);
    expect(assertCanReplay).not.toHaveBeenCalled();
  });

  it('turns an archived task refusal into its contract problem before replay', async () => {
    const assertCanReplay = vi
      .fn()
      .mockRejectedValue(new TaskRefusal({ reason: 'task-archived', key: 'CAD-482' }));
    const guard = new TimeEntryReplayAccessGuard({
      assertCanReplay,
    } as unknown as CreateTaskTimeEntry);
    await expect(guard.canActivate(context('key', 'CAD-482'))).rejects.toMatchObject({
      problem: { status: 409, code: 'task.archived' },
    });
  });

  it('refuses a keyed request without a verified principal', async () => {
    const assertCanReplay = vi.fn();
    const guard = new TimeEntryReplayAccessGuard({
      assertCanReplay,
    } as unknown as CreateTaskTimeEntry);
    const unauthenticated = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'idempotency-key': 'key' },
          params: { taskKey: 'CAD-482' },
        }),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(unauthenticated)).rejects.toMatchObject({
      problem: { status: 403, code: 'auth.actor-not-allowed' },
    });
    expect(assertCanReplay).not.toHaveBeenCalled();
  });
});
