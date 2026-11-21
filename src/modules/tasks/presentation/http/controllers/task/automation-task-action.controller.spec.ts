import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import type { ApplyAutomationTaskAction } from '../../../../application/use-cases/commands/task/apply-automation-task-action/apply-automation-task-action.use-case.js';
import { AutomationTaskActionReplayGuard } from '../../guards/task/automation-task-action-replay.guard.js';
import { AutomationTaskActionController } from './automation-task-action.controller.js';

const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';
const ruleId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const authorId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

function requestOf(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: { 'idempotency-key': 'p6-command' },
    rawHeaders: ['Idempotency-Key', 'p6-command'],
    params: { taskKey: 'CAD-482' },
    query: {},
    is: () => 'application/json',
    body: { ruleAuthorUserId: authorId, type: 'priority', priority: 'haute' },
    internalPrincipal: {
      issuer: 'automation-service',
      audience: 'task-service',
      organizationId,
      actor: { type: 'automation', id: ruleId },
      role: null,
      scopes: [],
      traceId: null,
    },
    ...overrides,
  } as unknown as Request;
}

function executionContext(request: Request): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('Automation task action', () => {
  it('checks current authority before replay and returns only the published receipt', async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ disposition: 'applied', private: 'hidden' });
    const action = { authorize, execute } as unknown as ApplyAutomationTaskAction;
    const request = requestOf();
    await expect(
      new AutomationTaskActionReplayGuard(action).canActivate(executionContext(request)),
    ).resolves.toBe(true);
    await expect(new AutomationTaskActionController(action).apply(request)).resolves.toEqual({
      disposition: 'applied',
    });
    expect(authorize).toHaveBeenCalledWith({
      organizationId,
      ruleId,
      taskKey: 'CAD-482',
      ruleAuthorUserId: authorId,
      action: { type: 'priority', priority: 'haute' },
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ taskKey: 'CAD-482' }));
  });

  it('refuses a revoked rule author before a stored receipt can be replayed', async () => {
    const authorize = vi
      .fn()
      .mockRejectedValue(new TaskRefusal({ reason: 'organization-not-found' }));
    const guard = new AutomationTaskActionReplayGuard({
      authorize,
    } as unknown as ApplyAutomationTaskAction);
    await expect(guard.canActivate(executionContext(requestOf()))).rejects.toMatchObject({
      problem: { status: 404, code: 'task.not-found' },
    });
  });

  it('reports each malformed body field before rechecking authorization', async () => {
    const authorize = vi.fn();
    const guard = new AutomationTaskActionReplayGuard({
      authorize,
    } as unknown as ApplyAutomationTaskAction);
    const request = requestOf({
      body: { ruleAuthorUserId: 'invalid', type: 'priority', priority: 'unknown' },
    });
    await expect(guard.canActivate(executionContext(request))).rejects.toMatchObject({
      problem: {
        status: 400,
        code: 'request.invalid',
        details: {
          issues: expect.arrayContaining([
            expect.objectContaining({ in: 'body', path: 'ruleAuthorUserId' }),
            expect.objectContaining({ in: 'body', path: 'priority' }),
          ]) as unknown,
        },
      },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('identifies each unknown body property', async () => {
    const authorize = vi.fn();
    const guard = new AutomationTaskActionReplayGuard({
      authorize,
    } as unknown as ApplyAutomationTaskAction);
    const request = requestOf({
      body: {
        ruleAuthorUserId: authorId,
        type: 'priority',
        priority: 'haute',
        extra: true,
        other: 1,
      },
    });
    await expect(guard.canActivate(executionContext(request))).rejects.toMatchObject({
      problem: {
        details: {
          issues: expect.arrayContaining([
            expect.objectContaining({ path: 'extra', code: 'unrecognized_keys' }),
            expect.objectContaining({ path: 'other', code: 'unrecognized_keys' }),
          ]) as unknown,
        },
      },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('refuses urlencoded input before authorization', async () => {
    const authorize = vi.fn();
    const guard = new AutomationTaskActionReplayGuard({
      authorize,
    } as unknown as ApplyAutomationTaskAction);
    await expect(
      guard.canActivate(
        executionContext(requestOf({ is: () => 'application/x-www-form-urlencoded' })),
      ),
    ).rejects.toMatchObject({
      problem: {
        status: 400,
        code: 'request.invalid',
        details: { issues: [expect.objectContaining({ in: 'body', code: 'invalid_type' })] },
      },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    { headers: {} },
    { rawHeaders: ['Idempotency-Key', 'p6-command', 'idempotency-key', 'p6-command'] },
    { body: { ruleAuthorUserId: authorId, type: 'priority', priority: 'haute', extra: true } },
    { query: { extra: 'value' } },
    { params: { taskKey: 'cad-482' } },
  ])('rejects malformed input before authorization or replay', async (overrides) => {
    const authorize = vi.fn();
    const guard = new AutomationTaskActionReplayGuard({
      authorize,
    } as unknown as ApplyAutomationTaskAction);
    await expect(guard.canActivate(executionContext(requestOf(overrides)))).rejects.toMatchObject({
      problem: { status: 400, code: 'request.invalid' },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('rejects a non-Automation actor before authorization', async () => {
    const authorize = vi.fn();
    const guard = new AutomationTaskActionReplayGuard({
      authorize,
    } as unknown as ApplyAutomationTaskAction);
    const request = requestOf({
      internalPrincipal: {
        issuer: 'integration-service',
        audience: 'task-service',
        organizationId,
        actor: { type: 'git', id: ruleId },
        role: null,
        scopes: [],
        traceId: null,
      },
    });
    await expect(guard.canActivate(executionContext(request))).rejects.toMatchObject({
      problem: { status: 403, code: 'auth.actor-not-allowed' },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    [{ reason: 'assignee-invalid', userIds: [authorId] }, 'task.assignee-invalid'],
    [{ reason: 'assignee-limit-reached' }, 'task.assignee-limit-reached'],
  ] as const)(
    'returns the documented assignment refusal without resource details',
    async (refusal, code) => {
      const execute = vi.fn().mockRejectedValue(new TaskRefusal(refusal));
      const controller = new AutomationTaskActionController({
        execute,
      } as unknown as ApplyAutomationTaskAction);
      await expect(controller.apply(requestOf())).rejects.toMatchObject({
        problem: { status: 422, code },
      });
    },
  );

  it('maps failures to a retryable private error without leaking details', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('internal resource details'));
    const controller = new AutomationTaskActionController({
      execute,
    } as unknown as ApplyAutomationTaskAction);
    await expect(controller.apply(requestOf())).rejects.toMatchObject({
      problem: { status: 503, code: 'task.action-unavailable' },
    });
  });

  it('maps an assignment with canonical UUIDs', async () => {
    const execute = vi.fn().mockResolvedValue({ disposition: 'no_op' });
    const controller = new AutomationTaskActionController({
      execute,
    } as unknown as ApplyAutomationTaskAction);
    await controller.apply(
      requestOf({
        body: {
          ruleAuthorUserId: authorId.toUpperCase(),
          type: 'assign',
          userId: ruleId.toUpperCase(),
        },
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleAuthorUserId: authorId,
        action: { type: 'assign', userId: ruleId },
      }),
    );
  });
});
