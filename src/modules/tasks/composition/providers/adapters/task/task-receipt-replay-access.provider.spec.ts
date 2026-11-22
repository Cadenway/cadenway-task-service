import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { lastValueFrom, of } from 'rxjs';
import type { Server } from 'node:http';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import { DuplicateTask } from '../../../../application/use-cases/commands/task/duplicate-task/duplicate-task.use-case.js';
import { AssertCanReplayTaskReceipt } from '../../../../application/use-cases/queries/task/assert-can-replay-task-receipt/assert-can-replay-task-receipt.use-case.js';
import { BulkTaskActionsController } from '../../../../presentation/http/controllers/bulk/bulk-task-actions.controller.js';
import { TaskDuplicateController } from '../../../../presentation/http/controllers/duplicate/task-duplicate.controller.js';
import { RequiredDuplicateBodyGuard } from '../../../../presentation/http/guards/duplicate/required-duplicate-body.guard.js';
import { TaskReceiptReplayAccessInterceptor } from './task-receipt-replay-access.provider.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const originalListId = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12';
const copied = {
  key: 'CAD-495',
  name: 'Connexion (copie)',
  status: 'progress',
  cancelReason: null,
  description: '## Contexte',
  descriptionMentions: [],
  cancelNote: null,
  priority: 'haute',
  assignees: [{ userId: actorUserId }],
  dueDate: null,
  startDate: null,
  estimateMinutes: null,
  labels: [],
  parentKey: null,
  listId: originalListId,
  spaceId: organizationId,
  subtaskCounts: { total: 0, closed: 0 },
  checklistCounts: { total: 0, done: 0 },
  completedAt: null,
  createdAt: '2026-11-20T09:00:00.000Z',
  version: 1,
  checklist: [],
  createdBy: { type: 'user', id: actorUserId },
  updatedAt: '2026-11-20T09:00:00.000Z',
  archivedAt: null,
  archivedBy: null,
};

/** Mimics the shared kit interceptor's successful replay. */
@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: {
        intercept(context: ExecutionContext) {
          const response = context.switchToHttp().getResponse<Response>();
          response.setHeader('Idempotent-Replayed', 'true');
          response.setHeader('Location', '/internal/v1/tasks/CAD-495');
          response.setHeader('ETag', '"1"');
          return of(copied);
        },
      },
    },
  ],
})
class ReplayingDatabaseModule {}

function setup(
  replayed: boolean,
  body: unknown = copied,
  requestBody: unknown = {},
  handler: unknown = Reflect.get(TaskDuplicateController.prototype, 'duplicate'),
) {
  const execute = vi.fn().mockResolvedValue(undefined);
  const interceptor = new TaskReceiptReplayAccessInterceptor({
    execute,
  } as unknown as AssertCanReplayTaskReceipt);
  const removeHeader = vi.fn();
  const response = {
    getHeader: vi.fn().mockReturnValue(replayed ? 'true' : undefined),
    removeHeader,
  } as unknown as Response;
  const request = {
    body: requestBody,
    headers: { 'idempotency-key': 'known-key' },
    params: { taskKey: 'CAD-482' },
    internalPrincipal: {
      organizationId,
      actor: { type: 'user', id: actorUserId },
      role: null,
      scopes: [],
      issuer: 'api-gateway',
      audience: 'task-service',
      traceId: null,
    },
  } as unknown as Request;
  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  const next = { handle: () => of(body) } as CallHandler;
  return { execute, interceptor, removeHeader, context, next };
}

describe('task mutation replay access', () => {
  it('checks both the source and the original list of the cached copy', async () => {
    const { execute, interceptor, context, next } = setup(true);
    expect(await lastValueFrom(interceptor.intercept(context, next))).toEqual(copied);
    expect(execute).toHaveBeenCalledWith({
      organizationId,
      actorUserId,
      taskKeys: ['CAD-482', 'CAD-495'],
      listIds: [originalListId],
      notFound: 'task-not-found',
    });
  });

  it('keeps the first response unchanged without a second authorization', async () => {
    const { execute, interceptor, context, next } = setup(false);
    expect(await lastValueFrom(interceptor.intercept(context, next))).toEqual(copied);
    expect(execute).not.toHaveBeenCalled();
  });

  it('removes cached response headers when access has been revoked', async () => {
    const { execute, interceptor, context, next, removeHeader } = setup(true);
    execute.mockRejectedValue(new TaskRefusal({ reason: 'task-not-found' }));
    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toMatchObject({
      problem: { status: 404, code: 'task.not-found' },
    });
    expect(removeHeader).toHaveBeenCalledWith('Location');
    expect(removeHeader).toHaveBeenCalledWith('ETag');
    expect(removeHeader).toHaveBeenCalledWith('Idempotent-Replayed');
  });

  it('refuses a stored response without a valid original list', async () => {
    const { execute, interceptor, context, next, removeHeader } = setup(true, {
      ...copied,
      listId: '',
    });
    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toMatchObject({
      problem: { status: 404, code: 'task.not-found' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(removeHeader).toHaveBeenCalledWith('Location');
  });

  it('ignores cached responses from other handlers', async () => {
    const { execute, interceptor, context, next } = setup(true);
    const other = {
      ...context,
      getHandler: () =>
        function anotherHandler() {
          return undefined;
        },
    } as ExecutionContext;
    expect(await lastValueFrom(interceptor.intercept(other, next))).toEqual(copied);
    expect(execute).not.toHaveBeenCalled();
  });

  it('checks every selected and copied task in a receipt for a fifty-task bulk request', async () => {
    const selection = Array.from({ length: 50 }, (_, index) => ({
      taskKey: `CAD-${String(index + 1)}`,
    }));
    const results = selection.map(({ taskKey }, index) => ({
      taskKey,
      newTaskKey: `CPY-${String(index + 1)}`,
    }));
    const body = { results, affectedCount: 50 };
    const { execute, interceptor, context, next } = setup(
      true,
      body,
      { selection, action: { type: 'duplicate' } },
      Reflect.get(BulkTaskActionsController.prototype, 'execute'),
    );
    expect(await lastValueFrom(interceptor.intercept(context, next))).toEqual(body);
    expect(execute).toHaveBeenCalledWith({
      organizationId,
      actorUserId,
      taskKeys: results.flatMap(({ taskKey, newTaskKey }) => [taskKey, newTaskKey]),
      listIds: [],
      trash: [],
      bulk: { key: 'known-key', serializedResponse: JSON.stringify(body) },
      notFound: 'task-not-found',
    });
  });

  it('wraps a global database replay and refuses the HTTP response after revocation', async () => {
    const execute = vi.fn().mockRejectedValue(new TaskRefusal({ reason: 'task-not-found' }));
    const module = await Test.createTestingModule({
      imports: [ReplayingDatabaseModule],
      controllers: [TaskDuplicateController],
      providers: [
        { provide: DuplicateTask, useValue: {} },
        { provide: AssertCanReplayTaskReceipt, useValue: { execute } },
        RequiredDuplicateBodyGuard,
        TaskReceiptReplayAccessInterceptor,
        { provide: APP_INTERCEPTOR, useExisting: TaskReceiptReplayAccessInterceptor },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.use((incoming: Request, _response: Response, next: () => void) => {
      Object.assign(incoming, {
        internalPrincipal: {
          organizationId,
          actor: { type: 'user', id: actorUserId },
          role: null,
          scopes: [],
          issuer: 'api-gateway',
          audience: 'task-service',
          traceId: null,
        },
      });
      next();
    });
    await app.init();
    try {
      const result = await request(app.getHttpServer() as Server)
        .post('/internal/v1/tasks/CAD-482/duplicate')
        .set('Idempotency-Key', 'known-key')
        .send({})
        .expect(404);
      expect(execute).toHaveBeenCalledOnce();
      expect(result.headers).not.toHaveProperty('location');
      expect(result.headers.etag).not.toBe('"1"');
      expect(result.headers).not.toHaveProperty('idempotent-replayed');
    } finally {
      await app.close();
    }
  });
});
