import {
  eventSchemas,
  INTAKE_ATTACHMENT_CLAIMED_V1,
  INTAKE_ATTACHMENT_RELEASED_V1,
} from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { AppendedEvent, OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { IntakeAttachmentDecision } from '../../../../domain/events/attachment/intake-attachment-decision.event.js';

/** Records the terminal Storage decision in the transaction that persists it. */
export class OutboxIntakeAttachmentDecisions {
  // #region Constructor
  /** Binds the writer to the transaction already holding the reservation locks. */
  public constructor(
    private readonly transaction: TransactionScope<DatabaseSchema>,
    private readonly outbox: Pick<OutboxWriter, 'append'>,
  ) {}
  // #endregion

  // #region Methods
  /** Publishes only the reservation identity and the task key needed to apply a claim. */
  public async append(decision: IntakeAttachmentDecision): Promise<AppendedEvent> {
    const { kind, organizationId } = this.transaction;
    if (kind !== 'tenant' || organizationId?.toLowerCase() !== decision.organizationId) {
      throw new Error('The intake attachment decision does not match its tenant transaction.');
    }
    const data = {
      actor: { type: 'system', id: 'task-service' },
      version: 1,
      organizationId,
      publicationId: decision.publicationId,
      attachmentId: decision.attachmentId,
    } as const;
    if (decision.kind === 'claimed') {
      return this.outbox.append(this.transaction, eventSchemas, INTAKE_ATTACHMENT_CLAIMED_V1, {
        ...data,
        taskKey: decision.taskKey,
      });
    }
    return this.outbox.append(this.transaction, eventSchemas, INTAKE_ATTACHMENT_RELEASED_V1, data);
  }
  // #endregion
}
