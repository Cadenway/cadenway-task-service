import type { TenantTransactionRunner } from '@cadenway/nest-common/database';

import type { ReportingReader } from '../../../../../application/ports/outbound/persistence/reporting/reporting-reader.port.js';
import type { ReportingUnitOfWork } from '../../../../../application/ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { DrizzleReportingReader } from '../../repositories/reporting/drizzle-reporting-reader.repository.js';

/** Opens one tenant snapshot for all report reads and the associated visibility checks. */
export class TenantReportingUnitOfWork implements ReportingUnitOfWork {
  // #region Constructor
  /** Binds the reporting unit of work to the tenant runner. */
  public constructor(private readonly runner: TenantTransactionRunner) {}
  // #endregion

  // #region Methods
  /** Runs all reads and visibility checks in one read-only snapshot. */
  public runReadOnly<TResult>(
    work: (reader: ReportingReader) => Promise<TResult>,
    options?: { readonly maxAttempts: 1 },
  ): Promise<TResult> {
    return this.runner.run((transaction) => work(new DrizzleReportingReader(transaction.db)), {
      readOnly: true,
      isolationLevel: 'repeatable read',
      ...options,
    });
  }
  // #endregion
}
