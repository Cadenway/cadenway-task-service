import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { CommentWriteRefusal } from '../../../../application/models/comment/comment-write-refusal.model.js';
import type { ApplyAutomationTaskComment } from '../../../../application/use-cases/commands/comment/apply-automation-task-comment/apply-automation-task-comment.use-case.js';
import { AutomationCommentReplayGuard } from '../../guards/comment/automation-comment-replay.guard.js';
import { AutomationCommentController } from './automation-comment.controller.js';

const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';
const ruleId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const authorId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

function requestOf(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: { 'idempotency-key': 'p6-comment' },
    rawHeaders: ['Idempotency-Key', 'p6-comment'],
    params: { taskKey: 'CAD-482' },
    query: {},
    is: () => 'application/json',
    body: { ruleAuthorUserId: authorId, body: 'La maquette est prête.' },
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

function contextOf(request: Request): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('Automation comment action', () => {
  it('checks current access before execution and returns only the published receipt', async () => {
    const proof = { confirms: vi.fn().mockResolvedValue(true) };
    const authorizeAutomation = vi.fn().mockResolvedValue(proof);
    const executeAutomation = vi.fn().mockResolvedValue(undefined);
    const comments = {
      authorize: authorizeAutomation,
      execute: executeAutomation,
    } as unknown as ApplyAutomationTaskComment;
    const request = requestOf();
    await expect(
      new AutomationCommentReplayGuard(comments).canActivate(contextOf(request)),
    ).resolves.toBe(true);
    await expect(new AutomationCommentController(comments).apply(request)).resolves.toEqual({
      disposition: 'applied',
    });
    expect(authorizeAutomation).toHaveBeenCalledWith({
      organizationId,
      taskKey: 'CAD-482',
      ruleAuthorUserId: authorId,
    });
    expect(executeAutomation).toHaveBeenCalledWith(
      {
        organizationId,
        taskKey: 'CAD-482',
        ruleAuthorUserId: authorId,
        ruleId,
        body: 'La maquette est prête.',
      },
      proof,
    );
  });

  it('refuses revoked authority before reading or replaying a receipt', async () => {
    const authorizeAutomation = vi.fn().mockResolvedValue(null);
    const guard = new AutomationCommentReplayGuard({
      authorize: authorizeAutomation,
    } as unknown as ApplyAutomationTaskComment);
    await expect(guard.canActivate(contextOf(requestOf()))).rejects.toMatchObject({
      problem: { status: 404, code: 'task.not-found' },
    });
  });

  it.each([
    { headers: {} },
    { rawHeaders: ['Idempotency-Key', 'a', 'idempotency-key', 'b'] },
    { query: { secret: 'ignored' } },
    { params: { taskKey: 'cad-482' } },
    { body: { ruleAuthorUserId: authorId, body: 'Valid text', unexpected: true } },
    { body: { ruleAuthorUserId: 'invalid', body: '' } },
    { is: () => 'application/x-www-form-urlencoded' },
  ])('rejects malformed input before authorization', async (overrides) => {
    const authorizeAutomation = vi.fn();
    const guard = new AutomationCommentReplayGuard({
      authorize: authorizeAutomation,
    } as unknown as ApplyAutomationTaskComment);
    await expect(guard.canActivate(contextOf(requestOf(overrides)))).rejects.toMatchObject({
      problem: { status: 400, code: 'request.invalid' },
    });
    expect(authorizeAutomation).not.toHaveBeenCalled();
  });

  it('maps a transactional access refusal to the same private task problem', async () => {
    const executeAutomation = vi.fn().mockRejectedValue(new CommentWriteRefusal('task-not-found'));
    await expect(
      new AutomationCommentController({
        execute: executeAutomation,
      } as unknown as ApplyAutomationTaskComment).apply(requestOf()),
    ).rejects.toMatchObject({ problem: { status: 404, code: 'task.not-found' } });
  });

  it('masks unexpected persistence errors', async () => {
    const executeAutomation = vi.fn().mockRejectedValue(new Error('private details'));
    await expect(
      new AutomationCommentController({
        execute: executeAutomation,
      } as unknown as ApplyAutomationTaskComment).apply(requestOf()),
    ).rejects.toMatchObject({ problem: { status: 503, code: 'task.action-unavailable' } });
  });
});
