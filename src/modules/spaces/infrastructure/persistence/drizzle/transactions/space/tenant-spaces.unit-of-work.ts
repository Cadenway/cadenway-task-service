import type { TenantTransactionRunner, TransactionScope } from '@cadenway/nest-common/database';
import type { JobProducer } from '@cadenway/nest-jobs/runtime';
import type { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { SpacesStore } from '../../../../../application/models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { PostgresqlTransactionClock } from '../../../../adapters/postgresql/transaction-clock.adapter.js';
import { JobsTrashDeletedTasksQueue } from '../../../../jobs/pg-boss/trash/jobs-trash-deleted-tasks-queue.adapter.js';
import { OutboxSpaceEvents } from '../../../../messaging/outbox/space/outbox-space-events.adapter.js';
import { DrizzleGrantRepository } from '../../repositories/access/drizzle-grant.repository.js';
import { DrizzleTaskListRepository } from '../../repositories/list/drizzle-task-list.repository.js';
import { DrizzleSpacePrefixRepository } from '../../repositories/space/drizzle-space-prefix.repository.js';
import { DrizzleSpaceRepository } from '../../repositories/space/drizzle-space.repository.js';

/**
 * Class TenantSpacesUnitOfWork
 *
 * @description
 * `SpacesUnitOfWork` on the tenant transaction runner: the work runs in the organization context
 * of the caller, and row-level security limits it to that organization. A route marked
 * `@Idempotent()` and the handler of a member event run in the transaction a kit interceptor
 * opened: `run` joins it. The events appended go to the outbox of the same transaction, the jobs
 * enqueued (`task.trash-deleted-tasks` of a deletion) go through its connection, and the clock
 * reads the instant of that transaction (once per run).
 *
 * Once a run that appended events resolves, the relay is woken so they leave now instead of at
 * its next poll. A run joined to an outer transaction resolves before that one commits: the pass
 * it wakes does not see the rows yet, and the next poll publishes them.
 */
export class TenantSpacesUnitOfWork implements SpacesUnitOfWork {
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

  /**
   * Property jobs
   *
   * @description
   * The job producer of `@cadenway/nest-jobs`, which enqueues through the transaction of a run.
   *
   * @type {JobProducer}
   * @readonly
   */
  private readonly jobs: JobProducer;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the runner, the outbox writer and the relay of the kit, and the job producer.
   *
   * @param {TenantTransactionRunner} runner - The tenant transaction runner.
   * @param {OutboxWriter} outbox - The outbox writer.
   * @param {OutboxRelay} relay - The outbox relay.
   * @param {JobProducer} jobs - The job producer.
   * @constructor
   */
  public constructor(
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
    jobs: JobProducer,
  ) {
    this.runner = runner;
    this.outbox = outbox;
    this.relay = relay;
    this.jobs = jobs;
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
   * @param {(store: SpacesStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async run<TResult>(work: (store: SpacesStore) => Promise<TResult>): Promise<TResult> {
    const appends: { count: number } = { count: 0 };
    const result: TResult = await this.runner.run(
      (transaction: TransactionScope): Promise<TResult> =>
        work({
          spaces: new DrizzleSpaceRepository(transaction.db),
          prefixes: new DrizzleSpacePrefixRepository(transaction.db),
          lists: new DrizzleTaskListRepository(transaction.db),
          grants: new DrizzleGrantRepository(transaction.db),
          events: new OutboxSpaceEvents(transaction, this.outbox, (): void => {
            appends.count += 1;
          }),
          clock: new PostgresqlTransactionClock(transaction.db),
          trashQueue: new JobsTrashDeletedTasksQueue(transaction, this.jobs),
        }),
    );
    if (appends.count > 0) {
      this.relay.wake();
    }
    return result;
  }
  // #endregion
}
