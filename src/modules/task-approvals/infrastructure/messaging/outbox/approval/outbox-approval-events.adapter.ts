import {
  APPROVAL_DECIDED_V1,
  APPROVAL_REQUESTED_V1,
  eventSchemas,
} from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { ApprovalTaskContext } from '../../../../application/models/approval/approval-task-context.model.js';
import type { ApprovalEvents } from '../../../../application/ports/outbound/messaging/approval/approval-events.port.js';
import type { ApprovalDecided } from '../../../../domain/events/approval/approval-decided.event.js';
import type { ApprovalRequested } from '../../../../domain/events/approval/approval-requested.event.js';

/** Appends approval facts to the outbox of the transaction that changed the task and round. */
export class OutboxApprovalEvents implements ApprovalEvents {
  // #region Properties
  /** Transaction shared with the task and round writes. */
  private readonly transaction: TransactionScope<DatabaseSchema>;

  /** Kit writer responsible for contract validation, routing and trace propagation. */
  private readonly outbox: Pick<OutboxWriter, 'append'>;
  // #endregion

  // #region Constructor
  /** Binds the adapter to the caller's live transaction. */
  public constructor(
    transaction: TransactionScope<DatabaseSchema>,
    outbox: Pick<OutboxWriter, 'append'>,
  ) {
    this.transaction = transaction;
    this.outbox = outbox;
  }
  // #endregion

  // #region Methods
  /** Records the new round and its designated reviewers. */
  public async requested(
    context: ApprovalTaskContext,
    actorUserId: string,
    event: ApprovalRequested,
  ): Promise<void> {
    await this.outbox.append(this.transaction, eventSchemas, APPROVAL_REQUESTED_V1, {
      ...this.taskContext(context, actorUserId),
      roundId: event.roundId,
      reviewerUserIds: [...event.reviewerUserIds],
    });
  }

  /** Records an individual vote or withdrawal and links its comment when present. */
  public async decided(
    context: ApprovalTaskContext,
    actorUserId: string,
    event: ApprovalDecided,
  ): Promise<void> {
    if (event.reviewerUserId.toLowerCase() !== actorUserId.toLowerCase()) {
      throw new Error('The approval decision does not match its actor.');
    }

    await this.outbox.append(this.transaction, eventSchemas, APPROVAL_DECIDED_V1, {
      ...this.taskContext(context, actorUserId),
      roundId: event.roundId,
      requesterUserId: event.requesterUserId,
      decision: event.decision,
      commentId: event.commentId,
    });
  }

  /** Maps the confirmed task version and placement to the public event envelope. */
  private taskContext(context: ApprovalTaskContext, actorUserId: string) {
    const { kind, organizationId } = this.transaction;
    if (
      kind !== 'tenant' ||
      organizationId?.toLowerCase() !== context.organizationId.toLowerCase()
    ) {
      throw new Error('The approval event does not match its tenant transaction.');
    }

    return {
      organizationId,
      actor: { type: 'user' as const, id: actorUserId },
      version: context.version,
      key: context.taskKey,
      spaceId: context.spaceId,
      listId: context.listId,
    };
  }
  // #endregion
}
