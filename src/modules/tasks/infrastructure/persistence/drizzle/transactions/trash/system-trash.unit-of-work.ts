import type { SystemTransactionRunner, TransactionScope } from '@cadenway/nest-common/database';

import type { TrashSystemStore } from '../../../../../application/models/transactions/trash-system-store.model.js';
import type { TrashSystemUnitOfWork } from '../../../../../application/ports/outbound/transactions/trash/trash-system-unit-of-work.port.js';
import { PostgresqlTransactionClock } from '../../../../adapters/postgresql/transaction-clock.adapter.js';
import { DrizzleTrashOrganizationReader } from '../../repositories/trash/drizzle-trash-organization-reader.repository.js';

/**
 * Class SystemTrashUnitOfWork
 *
 * @description
 * `TrashSystemUnitOfWork` on the `SystemTransactionRunner` of `@cadenway/nest-common/database`:
 * a read-only system transaction, which the runner opens on the pool of the service (or joins
 * when the caller already runs one) and refuses inside a tenant transaction, so the
 * cross-organization read is never joined to the work of one organization. It appends no event
 * and enqueues no job.
 */
export class SystemTrashUnitOfWork implements TrashSystemUnitOfWork {
  // #region Properties
  /**
   * Property runner
   *
   * @description
   * The system transaction runner of the kit.
   *
   * @type {SystemTransactionRunner}
   * @readonly
   */
  private readonly runner: SystemTransactionRunner;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the system runner of the kit.
   *
   * @param {SystemTransactionRunner} runner - The system transaction runner.
   * @constructor
   */
  public constructor(runner: SystemTransactionRunner) {
    this.runner = runner;
  }
  // #endregion

  // #region Methods
  /**
   * Method runReadOnly
   *
   * @description
   * Runs `work` in one read-only system transaction with the store bound to it.
   *
   * @param {(store: TrashSystemStore) => Promise<TResult>} work - The read.
   * @returns {Promise<TResult>} What the work resolved with.
   * @throws {Error} When called inside a tenant transaction, which the runner refuses.
   */
  public async runReadOnly<TResult>(
    work: (store: TrashSystemStore) => Promise<TResult>,
  ): Promise<TResult> {
    return this.runner.run(
      (transaction: TransactionScope): Promise<TResult> =>
        work({
          organizations: new DrizzleTrashOrganizationReader(transaction.db),
          clock: new PostgresqlTransactionClock(transaction.db),
        }),
      { readOnly: true },
    );
  }
  // #endregion
}
