import type { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { CommentWriteStore } from '../../../../../application/models/comment/comment-write-store.model.js';
import { OutboxCommentEvents } from '../../../../messaging/outbox/comment/outbox-comment-events.adapter.js';
import type { CommentStore } from '../../../../../application/models/comment/comment-store.model.js';
import type { CommentUnitOfWork } from '../../../../../application/ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import { DrizzleCommentRepository } from '../../repositories/comment/drizzle-comment.repository.js';

/** Joins the tenant transaction and reads task access, comments and total from one snapshot. */
export class TenantCommentUnitOfWork implements CommentUnitOfWork {
  // #region Properties
  /** The kit tenant runner. */
  private readonly runner: TenantTransactionRunner;

  /** Kit outbox writer. */
  private readonly outbox: OutboxWriter;

  /** Relay wake-up after a successful write. */
  private readonly relay: OutboxRelay;
  // #endregion

  // #region Constructor
  /** Takes the kit runner. */
  public constructor(runner: TenantTransactionRunner, outbox: OutboxWriter, relay: OutboxRelay) {
    this.runner = runner;
    this.outbox = outbox;
    this.relay = relay;
  }
  // #endregion

  // #region Methods
  /** Runs the read in a read-only repeatable-read transaction. */
  public async read<TResult>(work: (store: CommentStore) => Promise<TResult>): Promise<TResult> {
    return this.runner.run((tx) => work({ comments: new DrizzleCommentRepository(tx.db) }), {
      readOnly: true,
      isolationLevel: 'repeatable read',
    });
  }

  /** Runs a write and its outbox append in one tenant transaction. */
  public async write<TResult>(
    work: (store: CommentWriteStore) => Promise<TResult>,
  ): Promise<TResult> {
    const result = await this.runner.run((tx) =>
      work({
        comments: new DrizzleCommentRepository(tx.db),
        events: new OutboxCommentEvents(tx, this.outbox),
      }),
    );
    this.relay.wake();
    return result;
  }
  // #endregion
}
