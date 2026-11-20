import {
  eventSchemas,
  INTAKE_ATTACHMENT_VERIFIED_V1,
} from '@cadenway/contracts/events/storage-service';
import type { EventConsumers, EventContext, EventSubscription } from '@cadenway/nest-messaging';
import { describe, expect, it, vi } from 'vitest';

import type { VerifyIntakeAttachment } from '../../../../application/use-cases/commands/attachment/verify-intake-attachment/verify-intake-attachment.use-case.js';
import { VerifyIntakeAttachmentHandler } from './verify-intake-attachment.handler.js';

type VerificationSubscription = EventSubscription<
  typeof eventSchemas,
  typeof INTAKE_ATTACHMENT_VERIFIED_V1
>;

const verified = eventSchemas[INTAKE_ATTACHMENT_VERIFIED_V1].parse({
  id: '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d32',
  occurredAt: '2026-11-20T14:02:00Z',
  organizationId: '019A5F3C-8D2E-7C4A-9B1F-3E5D7A9C1B2F',
  actor: { type: 'system', id: 'storage-service' },
  version: 1,
  publicationId: '019A7006-7A8B-7C9D-8E0F-1A2B3C4D5E01',
  attachmentId: '019A7006-7A8B-7C9D-8E0F-1A2B3C4D5E04',
});

const delivery: EventContext = {
  deliveryCount: 1,
  streamSequence: 1,
  redelivered: false,
  claimVersion: () => Promise.resolve(true),
  signal: new AbortController().signal,
};

async function fixture() {
  const execute = vi.fn<VerifyIntakeAttachment['execute']>().mockResolvedValue(true);
  const subscribe = vi.fn<EventConsumers['subscribe']>().mockResolvedValue(undefined);
  await new VerifyIntakeAttachmentHandler({ subscribe }, { execute }).onApplicationBootstrap();
  const subscription = subscribe.mock.calls[0]?.[0] as VerificationSubscription | undefined;
  if (subscription === undefined) throw new Error('Verification subscription is missing.');
  return { execute, subscription };
}

describe('Storage intake attachment verification', () => {
  it('uses the published durable and passes only the canonical reservation tuple', async () => {
    const { execute, subscription } = await fixture();
    expect(subscription).toMatchObject({
      handler: 'verify-intake-attachment',
      event: INTAKE_ATTACHMENT_VERIFIED_V1,
      schemas: eventSchemas,
      deliverPolicy: 'all',
    });
    await subscription.handle(verified, delivery);
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      organizationId: verified.organizationId.toLowerCase(),
      publicationId: verified.publicationId.toLowerCase(),
      attachmentId: verified.attachmentId.toLowerCase(),
    });
  });

  it('ignores a different actor and propagates cancellation or a failed transaction', async () => {
    const { execute, subscription } = await fixture();
    await subscription.handle(
      { ...verified, actor: { type: 'system', id: 'task-service' } },
      delivery,
    );
    expect(execute).not.toHaveBeenCalled();

    const aborted = new Error('Cancelled delivery.');
    await expect(
      subscription.handle(verified, { ...delivery, signal: AbortSignal.abort(aborted) }),
    ).rejects.toBe(aborted);
    expect(execute).not.toHaveBeenCalled();

    const failed = new Error('Failed reservation transaction.');
    execute.mockRejectedValueOnce(failed);
    await expect(subscription.handle(verified, delivery)).rejects.toBe(failed);
  });
});
