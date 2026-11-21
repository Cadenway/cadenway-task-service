import { ProblemException, ProblemFilter } from '@cadenway/nest-common';
import { InternalServerErrorException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import type { AuthorizeAutomationNotification } from '../../../../application/use-cases/queries/task/authorize-automation-notification/authorize-automation-notification.use-case.js';
import { AutomationNotificationAuthorizationFilter } from '../../errors/task/automation-notification-authorization.filter.js';
import { AutomationNotificationAuthorizationController } from './automation-notification-authorization.controller.js';

const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';
const authorId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const recipientId = '019a5f3c-9e1f-7b2a-8c3d-4e5f6a7b8c31';
const principal = {
  issuer: 'notification-service',
  audience: 'task-service',
  organizationId,
  actor: { type: 'system', id: 'notification-service' },
  role: null,
  scopes: [],
  traceId: null,
};

function requestOf(overrides: Record<string, unknown> = {}): Request {
  return {
    params: { taskKey: 'CAD-482' },
    query: {},
    is: () => 'application/json',
    body: { ruleAuthorUserId: authorId, recipientUserId: recipientId },
    internalPrincipal: principal,
    ...overrides,
  } as unknown as Request;
}

describe('Automation notification authorization', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns no body after a current access decision with the verified tenant', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const controller = new AutomationNotificationAuthorizationController({
      execute,
    } as unknown as AuthorizeAutomationNotification);
    await expect(
      controller.authorize(
        requestOf({
          body: {
            ruleAuthorUserId: authorId.toUpperCase(),
            recipientUserId: recipientId.toUpperCase(),
          },
        }),
      ),
    ).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      taskKey: 'CAD-482',
      ruleAuthorUserId: authorId,
      recipientUserId: recipientId,
    });
  });

  it.each([
    { internalPrincipal: { ...principal, issuer: 'automation-service' } },
    { internalPrincipal: { ...principal, actor: { type: 'system', id: 'other-service' } } },
    { internalPrincipal: { ...principal, organizationId: null } },
  ])('refuses a mismatched signed principal before looking up the task', async (overrides) => {
    const execute = vi.fn();
    const controller = new AutomationNotificationAuthorizationController({
      execute,
    } as unknown as AuthorizeAutomationNotification);
    await expect(controller.authorize(requestOf(overrides))).rejects.toMatchObject({
      problem: { status: 403 },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    { params: { taskKey: 'cad-482' } },
    { query: { unexpected: 'private' } },
    { body: { ruleAuthorUserId: 'invalid', recipientUserId: 'invalid' } },
    { body: { ruleAuthorUserId: authorId, recipientUserId: recipientId, extra: 'private' } },
    { is: () => 'application/x-www-form-urlencoded' },
  ])('rejects invalid contract input before looking up the task', async (overrides) => {
    const execute = vi.fn();
    const controller = new AutomationNotificationAuthorizationController({
      execute,
    } as unknown as AuthorizeAutomationNotification);
    await expect(controller.authorize(requestOf(overrides))).rejects.toMatchObject({
      problem: { status: 400, code: 'request.invalid' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('maps every access denial to the same opaque 404', async () => {
    const execute = vi.fn().mockRejectedValue(new TaskRefusal({ reason: 'task-not-found' }));
    const controller = new AutomationNotificationAuthorizationController({
      execute,
    } as unknown as AuthorizeAutomationNotification);
    await expect(controller.authorize(requestOf())).rejects.toMatchObject({
      problem: { status: 404, code: 'task.not-found' },
    });
  });

  it('maps snapshot failures to the fixed unavailable response', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('private details'));
    const controller = new AutomationNotificationAuthorizationController({
      execute,
    } as unknown as AuthorizeAutomationNotification);
    await expect(controller.authorize(requestOf())).rejects.toMatchObject({
      problem: {
        status: 503,
        code: 'task.notification-authorization-unavailable',
        title: 'Notification authorization unavailable.',
      },
    });
  });

  it('sets private caching and sanitizes failures from any part of the route pipeline', () => {
    const setHeader = vi.fn();
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
    } as unknown as ArgumentsHost;
    const delegate = vi.spyOn(ProblemFilter.prototype, 'catch').mockImplementation(() => undefined);
    new AutomationNotificationAuthorizationFilter().catch(
      new InternalServerErrorException('private'),
      host,
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    const received: unknown = delegate.mock.calls[0]?.[0];
    expect(received).toMatchObject({
      problem: { status: 503, code: 'task.notification-authorization-unavailable' },
    });
    expect(received).toBeInstanceOf(ProblemException);
  });
});
