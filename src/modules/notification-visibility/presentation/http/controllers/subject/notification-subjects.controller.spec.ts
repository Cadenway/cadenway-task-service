import 'reflect-metadata';

import { runWithOrganizationContext, ZodValidationPipe } from '@cadenway/nest-common';
import { HEADERS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { ResolveNotificationSubjects } from '../../../../application/use-cases/queries/subject/resolve-notification-subjects/resolve-notification-subjects.use-case.js';
import { NotificationSubjectLookupDto } from '../../dto/input/subject/notification-subject-lookup.dto.js';
import { NotificationSubjectsController } from './notification-subjects.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const userId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const taskId = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a23';
const listId = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12';

function request(issuer: string): Request {
  return { internalPrincipal: { issuer } } as unknown as Request;
}

function asMember<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'user', id: userId }, role: null, scopes: [] },
    work,
  );
}

describe('NotificationSubjectsController', () => {
  it('requires a gateway user and disables caching for the positional decision', () => {
    const handler: object = Object.getOwnPropertyDescriptor(
      NotificationSubjectsController.prototype,
      'resolve',
    )?.value as object;
    expect(Reflect.getMetadata('cadenway:internal-access', NotificationSubjectsController)).toEqual(
      {
        issuers: ['api-gateway', 'realtime-gateway'],
        actors: ['user'],
        organization: 'required',
      },
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('resolve');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
  });

  it('maps all four selectors and preserves the decisions in order', async () => {
    const execute = vi
      .fn<ResolveNotificationSubjects['execute']>()
      .mockResolvedValue([
        { visible: true },
        { visible: false },
        { visible: true },
        { visible: false },
      ]);
    const controller = new NotificationSubjectsController({
      execute,
    } as unknown as ResolveNotificationSubjects);
    const body: NotificationSubjectLookupDto = {
      subjects: [
        { subject: { kind: 'task-id', taskId }, display: {} },
        { subject: { kind: 'task-key', taskKey: 'CAD-482' } },
        { subject: { kind: 'list', listId } },
        { subject: { kind: 'space', spaceId: listId } },
      ],
    };

    await expect(asMember(() => controller.resolve(body, request('api-gateway')))).resolves.toEqual(
      {
        results: [{ visible: true }, { visible: false }, { visible: true }, { visible: false }],
      },
    );
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      userId,
      subjects: [
        { kind: 'task-id', reference: taskId, display: {} },
        { kind: 'task-key', reference: 'CAD-482' },
        { kind: 'list', reference: listId },
        { kind: 'space', reference: listId },
      ],
    });
  });

  it('refuses realtime display before looking up any subject', async () => {
    const execute = vi.fn<ResolveNotificationSubjects['execute']>();
    const controller = new NotificationSubjectsController({
      execute,
    } as unknown as ResolveNotificationSubjects);
    await expect(
      asMember(() =>
        controller.resolve(
          { subjects: [{ subject: { kind: 'task-id', taskId }, display: {} }] },
          request('realtime-gateway'),
        ),
      ),
    ).rejects.toMatchObject({ problem: { status: 403, code: 'auth.issuer-not-allowed' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses callers outside the trusted gateways before looking up any subject', async () => {
    const execute = vi.fn<ResolveNotificationSubjects['execute']>();
    const controller = new NotificationSubjectsController({
      execute,
    } as unknown as ResolveNotificationSubjects);
    const body: NotificationSubjectLookupDto = {
      subjects: [{ subject: { kind: 'task-id', taskId } }],
    };
    await expect(
      asMember(() => controller.resolve(body, request('integration-service'))),
    ).rejects.toMatchObject({ problem: { status: 403, code: 'auth.issuer-not-allowed' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports missing membership and snapshot failures using contract problems', async () => {
    const execute = vi.fn<ResolveNotificationSubjects['execute']>().mockResolvedValue(null);
    const controller = new NotificationSubjectsController({
      execute,
    } as unknown as ResolveNotificationSubjects);
    const body: NotificationSubjectLookupDto = {
      subjects: [{ subject: { kind: 'task-id', taskId } }],
    };
    await expect(
      asMember(() => controller.resolve(body, request('realtime-gateway'))),
    ).rejects.toMatchObject({
      problem: { status: 404, code: 'organization.not-found' },
    });
    execute.mockRejectedValue(new Error('database unavailable'));
    await expect(
      asMember(() => controller.resolve(body, request('api-gateway'))),
    ).rejects.toMatchObject({
      problem: { status: 503, code: 'task.notification-visibility-unavailable' },
    });
  });

  it('uses the generated validator for bounds and the strict subject union', () => {
    const pipe = new ZodValidationPipe();
    const metadata = { type: 'body' as const, metatype: NotificationSubjectLookupDto };
    expect(
      pipe.transform({ subjects: [{ subject: { kind: 'task-id', taskId } }] }, metadata),
    ).toBeDefined();
    for (const invalid of [
      { subjects: [] },
      { subjects: Array.from({ length: 101 }, () => ({ subject: { kind: 'task-id', taskId } })) },
      { subjects: [{ subject: { kind: 'space', spaceId: listId }, display: {} }] },
      { subjects: [{ subject: { kind: 'task-id', taskId, taskKey: 'CAD-482' } }] },
    ]) {
      expect(() => pipe.transform(invalid, metadata)).toThrow();
    }
  });
});
