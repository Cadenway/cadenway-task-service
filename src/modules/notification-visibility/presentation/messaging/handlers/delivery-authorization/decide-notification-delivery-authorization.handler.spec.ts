import {
  eventSchemas,
  NOTIFICATION_DELIVERY_AUTHORIZATION_REQUESTED_V1,
} from '@cadenway/contracts/events/notification-service';
import type { NotificationDeliveryAuthorizationRequestedV1 } from '@cadenway/contracts/events/notification-service';
import type { EventConsumers, EventContext, EventSubscription } from '@cadenway/nest-messaging';
import { describe, expect, it, vi } from 'vitest';

import type { NotificationDeliveryAuthorizationInput } from '../../../../application/models/delivery-authorization/notification-delivery-authorization.model.js';
import { DecideNotificationDeliveryAuthorizationHandler } from './decide-notification-delivery-authorization.handler.js';

const request = eventSchemas[NOTIFICATION_DELIVERY_AUTHORIZATION_REQUESTED_V1].parse({
  id: '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d13',
  organizationId: '019A5F3C-8D2E-7C4A-9B1F-3E5D7A9C1B2F',
  actor: { type: 'system', id: 'notification-service' },
  version: 1,
  occurredAt: '2026-11-08T11:00:00Z',
  authorizationRequestId: '019A7002-3C4D-7E5F-8A6B-7C8D9E0F1A24',
  recipientId: '019A5F3C-8D2E-7C4A-9B1F-3E5D7A9C1B30',
  subject: { kind: 'task-id', taskId: '019A7002-3C4D-7E5F-8A6B-7C8D9E0F1A23' },
  expiresAt: '2026-11-08T11:00:15Z',
});

const context: EventContext = {
  deliveryCount: 1,
  streamSequence: 1,
  redelivered: false,
  claimVersion: () => Promise.resolve(true),
  signal: new AbortController().signal,
};

/** Captures the registration through the same interface as the kit. */
async function fixture() {
  const subscribe = vi.fn<EventConsumers['subscribe']>().mockResolvedValue(undefined);
  const execute = vi
    .fn<(input: NotificationDeliveryAuthorizationInput, signal: AbortSignal) => Promise<void>>()
    .mockResolvedValue(undefined);
  await new DecideNotificationDeliveryAuthorizationHandler(
    { subscribe },
    { execute },
  ).onApplicationBootstrap();

  const registration = subscribe.mock.calls[0]?.[0] as
    | EventSubscription<
        typeof eventSchemas,
        typeof NOTIFICATION_DELIVERY_AUTHORIZATION_REQUESTED_V1
      >
    | undefined;
  if (registration === undefined) throw new Error('No authorization subscription was registered.');
  return { execute, registration, subscribe };
}

describe('Notification delivery authorization request', () => {
  it('registers the exact published event and durable handler name', async () => {
    const { subscribe, registration } = await fixture();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(registration.handler).toBe('decide-notification-delivery-authorization');
    expect(registration.event).toBe(NOTIFICATION_DELIVERY_AUTHORIZATION_REQUESTED_V1);
    expect(registration.schemas).toBe(eventSchemas);
    expect(registration.deliverPolicy).toBe('all');
    expect(registration.transactionIsolationLevel).toBe('repeatable read');
    expect(registration.handle).toBeTypeOf('function');
  });

  it('passes only the normalized durable binding and preserves an exact Task key', async () => {
    const { registration, execute } = await fixture();
    const byKey: NotificationDeliveryAuthorizationRequestedV1 = {
      ...request,
      subject: { kind: 'task-key', taskKey: 'CAD-482' },
    };
    await registration.handle(request, context);
    await registration.handle(byKey, context);

    const binding = {
      organizationId: request.organizationId.toLowerCase(),
      authorizationRequestId: request.authorizationRequestId.toLowerCase(),
      recipientId: request.recipientId.toLowerCase(),
      expiresAt: new Date(request.expiresAt),
    };
    expect(execute).toHaveBeenNthCalledWith(
      1,
      {
        ...binding,
        subject: { kind: 'task-id', reference: '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a23' },
      },
      context.signal,
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      { ...binding, subject: { kind: 'task-key', reference: 'CAD-482' } },
      context.signal,
    );
  });

  it('ignores a request that does not identify the Notification service actor', async () => {
    const { registration, execute } = await fixture();
    await registration.handle(
      { ...request, actor: { type: 'system', id: 'task-service' } },
      context,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves failure for kit retry and does not start an abandoned delivery', async () => {
    const { registration, execute } = await fixture();
    const failure = new Error('Visibility temporarily unavailable.');
    execute.mockRejectedValueOnce(failure);
    await expect(registration.handle(request, context)).rejects.toBe(failure);

    const aborted = new Error('Delivery cancelled.');
    await expect(
      registration.handle(request, { ...context, signal: AbortSignal.abort(aborted) }),
    ).rejects.toBe(aborted);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
