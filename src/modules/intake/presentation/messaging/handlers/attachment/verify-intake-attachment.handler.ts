import {
  eventSchemas,
  INTAKE_ATTACHMENT_VERIFIED_V1,
  type IntakeAttachmentVerifiedV1,
} from '@cadenway/contracts/events/storage-service';
import type { EventConsumers, EventContext } from '@cadenway/nest-messaging';
import type { OnApplicationBootstrap } from '@nestjs/common';

import type { VerifyIntakeAttachment } from '../../../../application/use-cases/commands/attachment/verify-intake-attachment/verify-intake-attachment.use-case.js';

/** Applies verified upload facts from Storage in the kit's deduplication transaction. */
export class VerifyIntakeAttachmentHandler implements OnApplicationBootstrap {
  // #region Constructor
  /** Binds the broker registration and the reservation operation. */
  public constructor(
    private readonly consumers: Pick<EventConsumers, 'subscribe'>,
    private readonly verification: Pick<VerifyIntakeAttachment, 'execute'>,
  ) {}
  // #endregion

  // #region Methods
  /** Registers the exact published subject and replays its retained facts on initial deployment. */
  public onApplicationBootstrap(): Promise<void> {
    return this.consumers.subscribe({
      handler: 'verify-intake-attachment',
      schemas: eventSchemas,
      event: INTAKE_ATTACHMENT_VERIFIED_V1,
      deliverPolicy: 'all',
      handle: (payload, context) => this.verify(payload, context),
    });
  }

  /** Forwards only the authenticated Storage reservation tuple. */
  private async verify(payload: IntakeAttachmentVerifiedV1, context: EventContext): Promise<void> {
    if (payload.actor.type !== 'system' || payload.actor.id !== 'storage-service') return;
    context.signal.throwIfAborted();
    await this.verification.execute({
      organizationId: payload.organizationId.toLowerCase(),
      publicationId: payload.publicationId.toLowerCase(),
      attachmentId: payload.attachmentId.toLowerCase(),
    });
    context.signal.throwIfAborted();
  }
  // #endregion
}
