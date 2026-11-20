import {
  eventSchemas,
  TASK_NOTIFICATION_DELIVERY_AUTHORIZED_V1,
} from '@cadenway/contracts/events/task-service';
import type { TaskNotificationDeliveryAuthorizedV1 } from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { AppendedEvent, OutboxWriter } from '@cadenway/nest-messaging/outbox';

/** Appends the redacted decision inside the transaction that persists its private binding. */
export class OutboxNotificationDeliveryAuthorization {
  // #region Constructor
  /** Binds the writer to the decision's tenant transaction. */
  public constructor(
    private readonly transaction: TransactionScope<DatabaseSchema>,
    private readonly outbox: Pick<OutboxWriter, 'append'>,
  ) {}
  // #endregion

  // #region Methods
  /** Publishes only the organization, correlation, outcome and deadline. */
  public async append(
    input: Readonly<
      Pick<
        TaskNotificationDeliveryAuthorizedV1,
        'organizationId' | 'authorizationRequestId' | 'decision'
      >
    > & { readonly validUntil: Date },
  ): Promise<AppendedEvent> {
    const { kind, organizationId } = this.transaction;
    if (kind !== 'tenant' || organizationId?.toLowerCase() !== input.organizationId.toLowerCase()) {
      throw new Error('The delivery decision does not match its tenant transaction.');
    }
    const event = await this.outbox.append(
      this.transaction,
      eventSchemas,
      TASK_NOTIFICATION_DELIVERY_AUTHORIZED_V1,
      {
        organizationId,
        actor: { type: 'system', id: 'task-service' },
        version: 1,
        authorizationRequestId: input.authorizationRequestId,
        decision: input.decision,
        validUntil: input.validUntil.toISOString(),
      },
    );
    if (input.decision === 'permit' && Date.parse(event.occurredAt) >= input.validUntil.getTime()) {
      throw new Error('A delivery permit must precede its expiry.');
    }
    return event;
  }
  // #endregion
}
