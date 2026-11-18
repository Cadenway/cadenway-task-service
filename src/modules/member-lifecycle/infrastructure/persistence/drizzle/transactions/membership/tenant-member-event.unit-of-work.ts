import type { TenantTransactionRunner, TransactionScope } from '@cadenway/nest-common/database';
import type { JobProducer } from '@cadenway/nest-jobs/runtime';

import type { MemberEventStore } from '../../../../../application/models/transactions/member-event-store.model.js';
import type { MemberEventUnitOfWork } from '../../../../../application/ports/outbound/transactions/membership/member-event-unit-of-work.port.js';
import { JobsRemovedMemberCleanUpQueue } from '../../../../jobs/pg-boss/membership/jobs-removed-member-clean-up-queue.adapter.js';

/**
 * Class TenantMemberEventUnitOfWork
 *
 * @description
 * `MemberEventUnitOfWork` on the tenant transaction runner of the kit. The consumer of the kit runs
 * each member event in the organization context of its envelope, and its deduplicator opens the
 * tenant transaction that records the event id: `run` joins it, and so do the operations of
 * organization-members and spaces the use case calls, through the same runner. The store of each
 * run enqueues the clean-up jobs through the connection of that transaction.
 */
export class TenantMemberEventUnitOfWork implements MemberEventUnitOfWork {
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
   * Takes the runner of the kit and the job producer.
   *
   * @param {TenantTransactionRunner} runner - The tenant transaction runner.
   * @param {JobProducer} jobs - The job producer.
   * @constructor
   */
  public constructor(runner: TenantTransactionRunner, jobs: JobProducer) {
    this.runner = runner;
    this.jobs = jobs;
  }
  // #endregion

  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs `work` in the tenant transaction of the current organization context, joining the one of
   * the deduplicator, with a store bound to it.
   *
   * @param {(store: MemberEventStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public run<TResult>(work: (store: MemberEventStore) => Promise<TResult>): Promise<TResult> {
    return this.runner.run((transaction: TransactionScope): Promise<TResult> =>
      work({ cleanUps: new JobsRemovedMemberCleanUpQueue(transaction, this.jobs) }),
    );
  }
  // #endregion
}
