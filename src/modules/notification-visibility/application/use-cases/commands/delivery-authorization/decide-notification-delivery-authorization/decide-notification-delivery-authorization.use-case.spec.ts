import { describe, expect, it, vi } from 'vitest';

import type { NotificationDeliveryAuthorizationInput } from '../../../../models/delivery-authorization/notification-delivery-authorization.model.js';
import type { NotificationDeliveryDecisionStore } from '../../../../ports/outbound/persistence/delivery-authorization/notification-delivery-decision-store.port.js';
import { DecideNotificationDeliveryAuthorization } from './decide-notification-delivery-authorization.use-case.js';

describe('DecideNotificationDeliveryAuthorization', () => {
  const input: NotificationDeliveryAuthorizationInput = {
    organizationId: 'tenant',
    authorizationRequestId: 'correlation',
    recipientId: 'recipient',
    subject: { kind: 'task-key', reference: 'CAD-482' },
    expiresAt: new Date(10_000),
  };

  it('allows only a decision made while the request is live', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const repository: NotificationDeliveryDecisionStore = {
      lock: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue(null),
      insert,
    };
    const publish = vi.fn().mockResolvedValue({ id: 'event-id' });
    const visibility = vi.fn().mockResolvedValue([{ visible: true }]);
    const now = vi.fn(() => 10_000).mockReturnValueOnce(9_999);
    const run = new DecideNotificationDeliveryAuthorization(
      (work) => work(repository, publish),
      { execute: visibility },
      now,
    );

    await run.execute(input, new AbortController().signal, () => Promise.resolve(true));

    expect(visibility).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      userId: input.recipientId,
      subjects: [input.subject],
    });
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      organizationId: input.organizationId,
      authorizationRequestId: input.authorizationRequestId,
      decision: 'deny',
      validUntil: input.expiresAt,
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'deny', eventId: 'event-id', eventVersion: 1 }),
    );
  });

  it('does not recalculate or emit when a previous decision already bound the correlation', async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockResolvedValue(undefined);
    const repository: NotificationDeliveryDecisionStore = {
      lock,
      find: vi.fn().mockResolvedValue({ recipientId: 'different' }),
      insert,
    };
    const publish = vi.fn().mockResolvedValue({ id: 'event-id' });
    const visibility = vi.fn().mockResolvedValue([{ visible: true }]);
    const run = new DecideNotificationDeliveryAuthorization(
      (work) => work(repository, publish),
      { execute: visibility },
      () => 0,
    );

    await run.execute(input, new AbortController().signal, () => Promise.resolve(true));

    expect(lock).toHaveBeenCalledWith(input.organizationId, input.authorizationRequestId);
    expect(visibility).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
