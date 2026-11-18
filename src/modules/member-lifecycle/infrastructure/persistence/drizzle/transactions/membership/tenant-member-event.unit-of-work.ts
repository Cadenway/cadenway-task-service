import type { TenantTransactionRunner } from '@cadenway/nest-common/database';

import type { MemberEventUnitOfWork } from '../../../../../application/ports/outbound/transactions/membership/member-event-unit-of-work.port.js';

/**
 * Class TenantMemberEventUnitOfWork
 *
 * @description
 * `MemberEventUnitOfWork` on the tenant transaction runner of the kit. The consumer of the kit runs
 * each member event in the organization context of its envelope, and its deduplicator opens the
 * tenant transaction that records the event id: `run` joins it, and so do the operations of
 * organization-members and spaces the use case calls, through the same runner.
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
   * Runs `work` in the tenant transaction of the current organization context, joining the one of
   * the deduplicator.
   *
   * @param {() => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public run<TResult>(work: () => Promise<TResult>): Promise<TResult> {
    return this.runner.run((): Promise<TResult> => work());
  }
  // #endregion
}
