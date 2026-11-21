import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { CommentCreated } from '../../../../application/models/comment/comment-created.model.js';
import type { CommentEvents } from '../../../../application/ports/outbound/messaging/comment/comment-events.port.js';

/** Comment facts written through the kit outbox in the tenant transaction. */
export class OutboxCommentEvents implements CommentEvents {
  // #region Properties
  /** Tenant transaction. */
  private readonly transaction: TransactionScope<DatabaseSchema>;

  /** Kit outbox writer. */
  private readonly outbox: OutboxWriter;
  // #endregion

  // #region Constructor
  /** Binds the current transaction and writer. */
  public constructor(transaction: TransactionScope<DatabaseSchema>, outbox: OutboxWriter) {
    this.transaction = transaction;
    this.outbox = outbox;
  }
  // #endregion

  // #region Methods
  /** Appends a text-free creation fact with the eligible audiences. */
  public async created(event: CommentCreated): Promise<void> {
    const organizationId = this.transaction.organizationId;
    if (
      this.transaction.kind !== 'tenant' ||
      organizationId?.toLowerCase() !== event.organizationId.toLowerCase()
    ) {
      throw new Error('The comment event does not match its tenant transaction.');
    }
    await this.outbox.append(this.transaction, eventSchemas, 'comment.created.v1', {
      organizationId,
      actor: event.actor,
      version: event.taskVersion,
      key: event.taskKey,
      spaceId: event.spaceId,
      listId: event.listId,
      commentId: event.commentId,
      commentVersion: event.commentVersion,
      mentionedUserIds: [...(event.mentionedUserIds ?? [])],
      watcherIds: [...(event.watcherIds ?? [])],
      ...(event.reply === undefined
        ? {}
        : { replyToCommentId: event.reply.commentId, replyToUserId: event.reply.userId }),
    });
  }

  /** Appends an edited fact without comment content. */
  public async updated(event: CommentCreated): Promise<void> {
    const organizationId = this.transaction.organizationId;
    if (
      this.transaction.kind !== 'tenant' ||
      organizationId?.toLowerCase() !== event.organizationId.toLowerCase()
    ) {
      throw new Error('The comment event does not match its tenant transaction.');
    }
    await this.outbox.append(this.transaction, eventSchemas, 'comment.updated.v1', {
      organizationId,
      actor: event.actor,
      version: event.taskVersion,
      key: event.taskKey,
      spaceId: event.spaceId,
      listId: event.listId,
      commentId: event.commentId,
      commentVersion: event.commentVersion,
      addedMentionUserIds: [...(event.addedMentionUserIds ?? [])],
      removedMentionUserIds: [...(event.removedMentionUserIds ?? [])],
    });
  }

  /** Appends a deletion fact without the deleted content. */
  public async deleted(event: CommentCreated): Promise<void> {
    const organizationId = this.transaction.organizationId;
    if (
      this.transaction.kind !== 'tenant' ||
      organizationId?.toLowerCase() !== event.organizationId.toLowerCase()
    ) {
      throw new Error('The comment event does not match its tenant transaction.');
    }
    await this.outbox.append(this.transaction, eventSchemas, 'comment.deleted.v1', {
      organizationId,
      actor: event.actor,
      version: event.taskVersion,
      key: event.taskKey,
      spaceId: event.spaceId,
      listId: event.listId,
      commentId: event.commentId,
      commentVersion: event.commentVersion,
    });
  }
  // #endregion
}
