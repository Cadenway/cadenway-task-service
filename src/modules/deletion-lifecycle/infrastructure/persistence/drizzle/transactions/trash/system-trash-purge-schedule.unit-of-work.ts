import type { SystemTransactionRunner, TransactionScope } from '@cadenway/nest-common/database';
import type { JobProducer } from '@cadenway/nest-jobs/runtime';

import type { TrashPurgeScheduleStore } from '../../../../../application/models/transactions/trash-purge-schedule-store.model.js';
import type { TrashPurgeScheduleUnitOfWork } from '../../../../../application/ports/outbound/transactions/trash/trash-purge-schedule-unit-of-work.port.js';
import { JobsTrashPurgeQueue } from '../../../../jobs/pg-boss/trash/jobs-trash-purge-queue.adapter.js';

/**
 * Class SystemTrashPurgeScheduleUnitOfWork
 *
 * @description
 * `TrashPurgeScheduleUnitOfWork` on the system transaction runner of the kit, the only runner that
 * opens a transaction outside an organization context, as the daily schedule runs. Each run opens
 * one system transaction and binds the purge queue of its store to its connection, so the jobs of a
 * page commit together. It only inserts job rows of `pgboss`: the read of the organizations with
 * trash to erase is the read-only system transaction of the tasks module, apart from this one, so
 * the work across organizations is one read of ids and this enqueue, and every erasure runs in a
 * tenant transaction of its own organization. The runner refuses to start inside a tenant
 * transaction.
 */
export class SystemTrashPurgeScheduleUnitOfWork implements TrashPurgeScheduleUnitOfWork {
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
   * Takes the system runner of the kit and the job producer.
   *
   * @param {SystemTransactionRunner} runner - The system transaction runner.
   * @param {JobProducer} jobs - The job producer.
   * @constructor
   */
  public constructor(runner: SystemTransactionRunner, jobs: JobProducer) {
    this.runner = runner;
    this.jobs = jobs;
  }
  // #endregion

  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in one system transaction with a store bound to it.
   *
   * @param {(store: TrashPurgeScheduleStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with, once committed.
   */
  public run<TResult>(
    work: (store: TrashPurgeScheduleStore) => Promise<TResult>,
  ): Promise<TResult> {
    return this.runner.run((transaction: TransactionScope): Promise<TResult> =>
      work({ purges: new JobsTrashPurgeQueue(transaction, this.jobs) }),
    );
  }
  // #endregion
}
