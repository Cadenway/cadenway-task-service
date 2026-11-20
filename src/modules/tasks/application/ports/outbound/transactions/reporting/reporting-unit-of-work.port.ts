import type { ReportingReader } from '../../persistence/reporting/reporting-reader.port.js';

/** Opens a read-only repeatable-read tenant snapshot shared by directories and report reads. */
export interface ReportingUnitOfWork {
  // #region Methods
  /** Executes the report operation. */
  runReadOnly<TResult>(work: (reader: ReportingReader) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
