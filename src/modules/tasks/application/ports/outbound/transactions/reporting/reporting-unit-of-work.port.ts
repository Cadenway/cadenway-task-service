import type { ReportingReader } from '../../persistence/reporting/reporting-reader.port.js';

/** Opens a read-only repeatable-read tenant snapshot shared by directories and report reads. */
export interface ReportingUnitOfWork {
  // #region Methods
  /** Executes the report operation. Streaming exports disable retries because bytes can escape. */
  runReadOnly<TResult>(
    work: (reader: ReportingReader) => Promise<TResult>,
    options?: { readonly maxAttempts: 1 },
  ): Promise<TResult>;
  // #endregion
}
