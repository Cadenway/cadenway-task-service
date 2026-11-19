import type { TenantTransactionRunner } from '@cadenway/nest-common/database';

import type { DeletionUnitOfWork } from '../../../../../application/ports/outbound/transactions/deletion/deletion-unit-of-work.port.js';

/**
 * Class TenantDeletionUnitOfWork
 *
 * @description
 * `DeletionUnitOfWork` on the tenant transaction runner of the kit: the work runs in the
 * organization context the runtime of the jobs set from the job (`runJobInOrganization` of
 * `src/app.module.ts`), and row-level security limits it to that organization. The operations of
 * the tasks, spaces and access-requests modules the work calls run through the same runner, so
 * they join this transaction, with the outbox rows they append; their units of work wake the relay
 * when they resolve, before this transaction commits, so those rows leave at the next poll of the
 * relay, within a second.
 */
export class TenantDeletionUnitOfWork implements DeletionUnitOfWork {
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
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the runner of the kit.
   *
   * @param {TenantTransactionRunner} runner - The tenant transaction runner.
   * @constructor
   */
  public constructor(runner: TenantTransactionRunner) {
    this.runner = runner;
  }
  // #endregion

  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in the tenant transaction of the current organization context.
   *
   * @param {() => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with, once committed.
   */
  public run<TResult>(work: () => Promise<TResult>): Promise<TResult> {
    return this.runner.run((): Promise<TResult> => work());
  }
  // #endregion
}
