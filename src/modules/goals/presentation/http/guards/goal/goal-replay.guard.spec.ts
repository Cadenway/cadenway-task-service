import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { GoalError } from '../../../../application/models/goal/goal-error.model.js';
import type { CreateGoal } from '../../../../application/use-cases/commands/goal/create-goal/create-goal.use-case.js';
import type { CreateGoalResult } from '../../../../application/use-cases/commands/goal/create-goal-result/create-goal-result.use-case.js';
import { GoalReplayGuard } from './goal-replay.guard.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const userId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const goalId = '019a7008-8b9c-7d0e-8f1a-2b3c4d5e6f01';

function requestContext(options: {
  goalId?: string;
  version?: string;
  key?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { 'idempotency-key': options.key, 'if-match': options.version },
        params: options.goalId === undefined ? {} : { goalId: options.goalId },
        query: { today: '2026-11-20' },
        body:
          options.goalId === undefined
            ? { name: 'Goal', ownerUserId: userId, dueDate: '2026-12-31', quarter: '2026-Q4' }
            : { kind: 'checkbox', label: 'Done', checked: false },
        internalPrincipal: {
          organizationId,
          actor: { type: 'user', id: userId },
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

describe('goal creation replay', () => {
  it('checks current access with the verified tenant before replay', async () => {
    const goal = { assertCanReplay: vi.fn().mockResolvedValue(undefined) };
    const result = {
      assertCanReplay: vi.fn().mockRejectedValue(new GoalError({ reason: 'missing-goal' })),
    };
    const guard = new GoalReplayGuard(
      goal as unknown as CreateGoal,
      result as unknown as CreateGoalResult,
    );
    await expect(guard.canActivate(requestContext({ key: 'key' }))).resolves.toBe(true);
    expect(goal.assertCanReplay).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, userId, results: [], spaceId: null }),
    );
    await expect(
      guard.canActivate(requestContext({ key: 'other', goalId, version: '"1"' })),
    ).rejects.toMatchObject({ problem: { status: 404, code: 'goal.not-found' } });
  });

  it('rejects malformed versions before replay and leaves an ordinary request to its handler', async () => {
    const goal = { assertCanReplay: vi.fn().mockResolvedValue(undefined) };
    const result = { assertCanReplay: vi.fn().mockResolvedValue(undefined) };
    const guard = new GoalReplayGuard(
      goal as unknown as CreateGoal,
      result as unknown as CreateGoalResult,
    );
    await expect(
      guard.canActivate(requestContext({ key: 'key', goalId, version: '**' })),
    ).rejects.toMatchObject({ problem: { status: 400, code: 'request.invalid' } });
    await expect(guard.canActivate(requestContext({ goalId, version: '"1"' }))).resolves.toBe(true);
    expect(result.assertCanReplay).not.toHaveBeenCalled();
  });
});
