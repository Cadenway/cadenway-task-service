import {
  eventSchemas,
  NOTIFICATION_DELIVERY_AUTHORIZATION_REQUESTED_V1,
} from '@cadenway/contracts/events/notification-service';
import type { NotificationDeliveryAuthorizationRequestedV1 } from '@cadenway/contracts/events/notification-service';
import type { EventConsumers, EventContext } from '@cadenway/nest-messaging';
import type { OnApplicationBootstrap } from '@nestjs/common';

import type { NotificationDeliveryAuthorizationInput } from '../../../../application/models/delivery-authorization/notification-delivery-authorization.model.js';

/** Delivers a validated Notification request to the Task authorization use case. */
export class DecideNotificationDeliveryAuthorizationHandler implements OnApplicationBootstrap {
  // #region Constructor
  /** Binds the kit registration and the local decision operation. */
  public constructor(
    private readonly consumers: Pick<EventConsumers, 'subscribe'>,
    private readonly decisions: {
      execute(input: NotificationDeliveryAuthorizationInput, signal: AbortSignal): Promise<void>;
    },
  ) {}
  // #endregion

  // #region Methods
  /** Registers the durable consumer on the retained Notification authorization requests. */
  public onApplicationBootstrap(): Promise<void> {
    return this.consumers.subscribe({
      handler: 'decide-notification-delivery-authorization',
      schemas: eventSchemas,
      event: NOTIFICATION_DELIVERY_AUTHORIZATION_REQUESTED_V1,
      deliverPolicy: 'all',
      transactionIsolationLevel: 'repeatable read',
      handle: (payload, context) => this.decide(payload, context),
    });
  }

  /** Passes only the immutable binding, with canonical UUID spelling, to the use case. */
  private async decide(
    request: NotificationDeliveryAuthorizationRequestedV1,
    context: EventContext,
  ): Promise<void> {
    if (request.actor.type !== 'system' || request.actor.id !== 'notification-service') {
      return;
    }
    context.signal.throwIfAborted();
    const subject = request.subject;
    await this.decisions.execute(
      {
        organizationId: request.organizationId.toLowerCase(),
        authorizationRequestId: request.authorizationRequestId.toLowerCase(),
        recipientId: request.recipientId.toLowerCase(),
        subject: {
          kind: subject.kind,
          reference: subject.kind === 'task-id' ? subject.taskId.toLowerCase() : subject.taskKey,
        },
        expiresAt: new Date(request.expiresAt),
      },
      context.signal,
    );
  }
  // #endregion
}
