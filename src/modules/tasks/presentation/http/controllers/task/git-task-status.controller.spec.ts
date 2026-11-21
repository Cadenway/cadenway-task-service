import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import type { ApplyGitTaskStatus } from '../../../../application/use-cases/commands/task/apply-git-task-status/apply-git-task-status.use-case.js';
import { GitTaskActionReplayGuard } from '../../guards/task/git-task-action-replay.guard.js';
import { GitTaskStatusController } from './git-task-status.controller.js';

const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';
const integrationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const authorId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const listId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';
const taskId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03';

function requestOf(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: { 'idempotency-key': 'p6-command' },
    rawHeaders: ['Idempotency-Key', 'p6-command'],
    params: { taskKey: 'CAD-482' },
    query: {},
    is: () => 'application/json',
    body: {
      provider: 'github',
      spaceId: integrationId,
      mappingAuthorUserId: authorId,
      status: 'review',
    },
    internalPrincipal: {
      issuer: 'integration-service',
      audience: 'task-service',
      organizationId,
      actor: { type: 'git', id: integrationId },
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

describe('Git task action', () => {
  it('rechecks authorization before replay and returns the minimal action receipt', async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({
      disposition: 'applied',
      taskId,
      listId,
      spaceId: integrationId,
      extra: 'not exposed',
    });
    const action = { authorize, execute } as unknown as ApplyGitTaskStatus;
    const request = requestOf();

    await expect(
      new GitTaskActionReplayGuard(action).canActivate(executionContext(request)),
    ).resolves.toBe(true);
    await expect(new GitTaskStatusController(action).apply(request)).resolves.toEqual({
      disposition: 'applied',
      taskId,
      listId,
      spaceId: integrationId,
    });
    expect(authorize).toHaveBeenCalledWith({
      organizationId,
      integrationId,
      taskKey: 'CAD-482',
      spaceId: integrationId,
      mappingAuthorUserId: authorId,
      provider: 'github',
      status: 'review',
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ taskKey: 'CAD-482' }));
  });

  it('refuses a revoked author before the replay interceptor can return a receipt', async () => {
    const authorize = vi
      .fn()
      .mockRejectedValue(new TaskRefusal({ reason: 'organization-not-found' }));
    const guard = new GitTaskActionReplayGuard({ authorize } as unknown as ApplyGitTaskStatus);
    await expect(guard.canActivate(executionContext(requestOf()))).rejects.toMatchObject({
      problem: { status: 404, code: 'task.not-found' },
    });
  });

  it('refuses urlencoded input before authorization', async () => {
    const authorize = vi.fn();
    const guard = new GitTaskActionReplayGuard({ authorize } as unknown as ApplyGitTaskStatus);
    await expect(
      guard.canActivate(
        executionContext(requestOf({ is: () => 'application/x-www-form-urlencoded' })),
      ),
    ).rejects.toMatchObject({
      problem: { status: 400, code: 'request.invalid' },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('reports every invalid field and unknown body property before authorization', async () => {
    const authorize = vi.fn();
    const guard = new GitTaskActionReplayGuard({ authorize } as unknown as ApplyGitTaskStatus);
    const request = requestOf({
      params: { taskKey: 'invalid' },
      query: { unexpected: 'value' },
      body: {
        provider: 'invalid',
        spaceId: 'invalid',
        mappingAuthorUserId: authorId,
        status: 'review',
        extra: 'secret input value',
        other: true,
      },
    });
    await expect(guard.canActivate(executionContext(request))).rejects.toMatchObject({
      problem: {
        status: 400,
        code: 'request.invalid',
        details: {
          issues: expect.arrayContaining([
            expect.objectContaining({ in: 'path', path: 'taskKey' }),
            expect.objectContaining({ in: 'query', path: 'unexpected' }),
            expect.objectContaining({ in: 'body', path: 'provider' }),
            expect.objectContaining({ in: 'body', path: 'spaceId' }),
            expect.objectContaining({ in: 'body', path: 'extra', code: 'unrecognized_keys' }),
            expect.objectContaining({ in: 'body', path: 'other', code: 'unrecognized_keys' }),
          ]) as unknown,
        },
      },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('returns a sanitized unavailable response when replay authorization fails unexpectedly', async () => {
    const authorize = vi.fn().mockRejectedValue(new Error('private database details'));
    const guard = new GitTaskActionReplayGuard({ authorize } as unknown as ApplyGitTaskStatus);
    await expect(guard.canActivate(executionContext(requestOf()))).rejects.toMatchObject({
      problem: { status: 503, code: 'task.action-unavailable' },
    });
  });

  it.each([
    ['an execution failure', () => Promise.reject(new Error('private database details'))],
    ['a malformed receipt', () => Promise.resolve({ disposition: 'applied' })],
  ])('returns a sanitized unavailable response for %s', async (_label, execute) => {
    const controller = new GitTaskStatusController({ execute } as unknown as ApplyGitTaskStatus);
    await expect(controller.apply(requestOf())).rejects.toMatchObject({
      problem: { status: 503, code: 'task.action-unavailable' },
    });
  });

  it('refuses a verified user actor even when it carries an organization', async () => {
    const authorize = vi.fn();
    const guard = new GitTaskActionReplayGuard({ authorize } as unknown as ApplyGitTaskStatus);
    const request = requestOf({
      internalPrincipal: {
        issuer: 'integration-service',
        audience: 'task-service',
        organizationId,
        actor: { type: 'user', id: authorId },
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
    { headers: {} },
    { rawHeaders: ['Idempotency-Key', 'p6-command', 'idempotency-key', 'p6-command'] },
    {
      body: {
        provider: 'github',
        spaceId: integrationId,
        mappingAuthorUserId: authorId,
        status: 'review',
        extra: true,
      },
    },
    { query: { extra: 'value' } },
    { params: { taskKey: 'cad-482' } },
  ])('rejects malformed requests before authorizing or replaying them', async (overrides) => {
    const authorize = vi.fn();
    const guard = new GitTaskActionReplayGuard({ authorize } as unknown as ApplyGitTaskStatus);
    await expect(guard.canActivate(executionContext(requestOf(overrides)))).rejects.toMatchObject({
      problem: { status: 400, code: 'request.invalid' },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it('accepts a null target as an authorized link-only command', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ disposition: 'no_op', taskId, listId, spaceId: integrationId });
    const body = {
      provider: 'gitlab',
      spaceId: integrationId,
      mappingAuthorUserId: authorId,
      status: null,
    };
    await new GitTaskStatusController({ execute } as unknown as ApplyGitTaskStatus).apply(
      requestOf({ body }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gitlab', status: null }),
    );
  });
});
