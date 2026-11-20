import {
  eventSchemas,
  TASK_NOTIFICATION_DELIVERY_AUTHORIZED_V1,
} from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { describe, expect, it, vi } from 'vitest';

import { OutboxNotificationDeliveryAuthorization } from './outbox-notification-delivery-authorization.adapter.js';

const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';
const authorizationRequestId = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a24';
const identity = {
  id: '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d14',
  occurredAt: '2026-11-08T11:00:02Z',
};

/** Binds a test writer to the supplied transaction scope. */
function fixture(
  scope: Pick<TransactionScope<DatabaseSchema>, 'kind' | 'organizationId'> = {
    kind: 'tenant',
    organizationId,
  },
) {
  const transaction = scope as TransactionScope<DatabaseSchema>;
  const append = vi.fn<OutboxWriter['append']>().mockResolvedValue(identity);
  return {
    adapter: new OutboxNotificationDeliveryAuthorization(transaction, { append }),
    append,
    transaction,
  };
}

describe('Task delivery authorization outbox', () => {
  it.each([
    ['permit', '2026-11-08T11:00:15.000Z'],
    ['deny', '2026-11-08T11:00:01.000Z'],
  ] as const)(
    'appends a redacted %s with the exact deadline and correlation',
    async (decision, expiry) => {
      const { adapter, append, transaction } = fixture();
      const validUntil = new Date(expiry);
      const data = {
        organizationId,
        actor: { type: 'system', id: 'task-service' },
        version: 1,
        authorizationRequestId,
        decision,
        validUntil: expiry,
      };
      await expect(
        adapter.append({ organizationId, authorizationRequestId, decision, validUntil }),
      ).resolves.toEqual(identity);
      expect(append).toHaveBeenCalledExactlyOnceWith(
        transaction,
        eventSchemas,
        TASK_NOTIFICATION_DELIVERY_AUTHORIZED_V1,
        data,
      );
      expect(
        eventSchemas[TASK_NOTIFICATION_DELIVERY_AUTHORIZED_V1].safeParse({ ...identity, ...data })
          .success,
      ).toBe(true);
    },
  );

  it('refuses to append a decision in a different tenant transaction', async () => {
    const { adapter, append } = fixture({
      kind: 'tenant',
      organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b21',
    });
    await expect(
      adapter.append({
        organizationId,
        authorizationRequestId,
        decision: 'deny',
        validUntil: new Date(identity.occurredAt),
      }),
    ).rejects.toThrow(/tenant transaction/u);
    expect(append).not.toHaveBeenCalled();
  });

  it('rejects a permit whose database envelope reaches the exclusive deadline', async () => {
    const { adapter } = fixture();
    await expect(
      adapter.append({
        organizationId,
        authorizationRequestId,
        decision: 'permit',
        validUntil: new Date(identity.occurredAt),
      }),
    ).rejects.toThrow(/must precede/u);
  });
});
