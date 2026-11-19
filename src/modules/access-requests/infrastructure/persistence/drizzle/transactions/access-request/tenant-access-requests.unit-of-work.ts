import type {
  TenantTransactionRunner,
  TransactionOptions,
  TransactionScope,
} from '@cadenway/nest-common/database';
import type { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { AccessRequestsStore } from '../../../../../application/models/transactions/access-requests-store.model.js';
import type { AccessRequestsUnitOfWork } from '../../../../../application/ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { PostgresqlTransactionClock } from '../../../../adapters/postgresql/transaction-clock.adapter.js';
import { OutboxAccessRequestEvents } from '../../../../messaging/outbox/access-request/outbox-access-request-events.adapter.js';
import { DrizzleAccessRequestRepository } from '../../repositories/access-request/drizzle-access-request.repository.js';
import { DrizzleRequestAttemptRepository } from '../../repositories/attempt/drizzle-request-attempt.repository.js';

/**
 * Class TenantAccessRequestsUnitOfWork
 *
 * @description
 * `AccessRequestsUnitOfWork` on the tenant transaction runner: the work runs in the organization
 * context of the caller, and row-level security limits it to that organization. A batch of the
 * clean-up job of a removed member opens its own. The store of each run is bound to that run's
 * transaction, the clock included (the instant of the transaction is read once per run), and the
 * operations of the organization-members, spaces and tasks modules the work calls join it through
 * their own runners. The events appended go to the outbox of the same transaction.
 *
 * Once a run that appended events resolves, the relay is woken so they leave now instead of at its
 * next poll. `runReadOnly` opens a read-only transaction, which the operations of the other
 * modules join as long as they ask for no more (the kit refuses a read-only join over a read-write
 * transaction, and a stronger isolation).
 */
export class TenantAccessRequestsUnitOfWork implements AccessRequestsUnitOfWork {
  // #region Properties
  /**
   * Property runner
   *
   * @description
   * The tenant transaction runner of the kit.
   *
   * @type {TenantTransactionRunner}
   * @readonly
   */
  private readonly runner: TenantTransactionRunner;

  /**
   * Property outbox
   *
   * @description
   * The outbox writer of the kit.
   *
   * @type {OutboxWriter}
   * @readonly
   */
  private readonly outbox: OutboxWriter;

  /**
   * Property relay
   *
   * @description
   * The outbox relay, woken after a run that appended events.
   *
   * @type {OutboxRelay}
   * @readonly
   */
  private readonly relay: OutboxRelay;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the runner, the outbox writer and the relay of the kit.
   *
   * @param {TenantTransactionRunner} runner - The tenant transaction runner.
   * @param {OutboxWriter} outbox - The outbox writer.
   * @param {OutboxRelay} relay - The outbox relay.
   * @constructor
   */
  public constructor(runner: TenantTransactionRunner, outbox: OutboxWriter, relay: OutboxRelay) {
    this.runner = runner;
    this.outbox = outbox;
    this.relay = relay;
  }
  // #endregion

  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in the tenant transaction of the current organization context, joining the
   * transaction of the caller when there is one, with a store bound to it.
   *
   * @param {(store: AccessRequestsStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async run<TResult>(
    work: (store: AccessRequestsStore) => Promise<TResult>,
  ): Promise<TResult> {
    return this.execute(work, {});
  }

  /**
   * Method runReadOnly
   *
   * @description
   * Runs `work` in a read-only tenant transaction.
   *
   * @param {(store: AccessRequestsStore) => Promise<TResult>} work - The read.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async runReadOnly<TResult>(
    work: (store: AccessRequestsStore) => Promise<TResult>,
  ): Promise<TResult> {
    return this.execute(work, { readOnly: true });
  }

  /**
   * Method execute
   *
   * @description
   * Runs `work` through the kit's runner with the requirements of the transaction, then wakes the
   * relay when the run appended events.
   *
   * @param {(store: AccessRequestsStore) => Promise<TResult>} work - The unit of work.
   * @param {TransactionOptions} options - The read-only requirement.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  private async execute<TResult>(
    work: (store: AccessRequestsStore) => Promise<TResult>,
    options: TransactionOptions,
  ): Promise<TResult> {
    const appends: { count: number } = { count: 0 };
    const result: TResult = await this.runner.run(
      (transaction: TransactionScope): Promise<TResult> =>
        work({
          requests: new DrizzleAccessRequestRepository(transaction.db),
          attempts: new DrizzleRequestAttemptRepository(transaction.db),
          events: new OutboxAccessRequestEvents(transaction, this.outbox, (): void => {
            appends.count += 1;
          }),
          clock: new PostgresqlTransactionClock(transaction.db),
        }),
      options,
    );
    if (appends.count > 0) {
      this.relay.wake();
    }
    return result;
  }
  // #endregion
}
