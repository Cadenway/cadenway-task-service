import {
  eventSchemas,
  INTAKE_ATTACHMENT_CLAIMED_V1,
  INTAKE_ATTACHMENT_RELEASED_V1,
} from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { describe, expect, it, vi } from 'vitest';

import { OutboxIntakeAttachmentDecisions } from './outbox-intake-attachment-decisions.adapter.js';

const reservation = {
  organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f',
  publicationId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e01',
  attachmentId: '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e04',
};
const envelope = {
  id: '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d33',
  occurredAt: '2026-11-20T14:03:00Z',
};

function fixture(organizationId = reservation.organizationId.toUpperCase()) {
  const transaction = { kind: 'tenant', organizationId } as TransactionScope<DatabaseSchema>;
  const append = vi.fn<OutboxWriter['append']>().mockResolvedValue(envelope);
  return {
    adapter: new OutboxIntakeAttachmentDecisions(transaction, { append }),
    transaction,
    append,
  };
}

describe('Task intake attachment decisions outbox', () => {
  it('appends only the contract fields in the supplied tenant transaction', async () => {
    const { adapter, transaction, append } = fixture();
    const data = {
      ...reservation,
      organizationId: transaction.organizationId,
      actor: { type: 'system', id: 'task-service' },
      version: 1,
    };
    const taskKey = 'CAD-482';
    await expect(adapter.append({ ...reservation, kind: 'claimed', taskKey })).resolves.toEqual(
      envelope,
    );
    await expect(adapter.append({ ...reservation, kind: 'released' })).resolves.toEqual(envelope);

    expect(append.mock.calls).toEqual([
      [transaction, eventSchemas, INTAKE_ATTACHMENT_CLAIMED_V1, { ...data, taskKey }],
      [transaction, eventSchemas, INTAKE_ATTACHMENT_RELEASED_V1, data],
    ]);
    expect(
      eventSchemas[INTAKE_ATTACHMENT_CLAIMED_V1].safeParse({ ...envelope, ...data, taskKey })
        .success,
    ).toBe(true);
    expect(
      eventSchemas[INTAKE_ATTACHMENT_RELEASED_V1].safeParse({ ...envelope, ...data }).success,
    ).toBe(true);
  });

  it('rejects a decision from another tenant before writing the outbox', async () => {
    const { adapter, append } = fixture('019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b21');
    await expect(adapter.append({ ...reservation, kind: 'released' })).rejects.toThrow(
      /tenant transaction/u,
    );
    expect(append).not.toHaveBeenCalled();
  });
});
