import type { TenantTransactionRunner } from '@cadenway/nest-common/database';

import type { PriorSprintReader } from '../../../../../application/ports/outbound/persistence/reporting/prior-sprint-reader.port.js';
import type { PriorSprintsUnitOfWork } from '../../../../../application/ports/outbound/transactions/reporting/prior-sprints-unit-of-work.port.js';
import { DrizzleSprintListHistoryRepository } from '../../repositories/sprint-history/drizzle-sprint-list-history.repository.js';

/** Supplies prior-sprint reads within one tenant snapshot. */
export class TenantPriorSprintsUnitOfWork implements PriorSprintsUnitOfWork {
  // #region Constructor
  /** Binds the unit of work to the service transaction runner. */
  public constructor(private readonly runner: TenantTransactionRunner) {}
  // #endregion

  // #region Methods
  /** Joins the caller's report snapshot or opens a read-only repeatable-read transaction. */
  public read<TResult>(work: (reader: PriorSprintReader) => Promise<TResult>): Promise<TResult> {
    return this.runner.run(
      (transaction) => work(new DrizzleSprintListHistoryRepository(transaction.db)),
      {
        readOnly: true,
        isolationLevel: 'repeatable read',
      },
    );
  }
  // #endregion
}
