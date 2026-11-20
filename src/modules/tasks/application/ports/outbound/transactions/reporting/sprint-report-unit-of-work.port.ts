import type { SprintReportReader } from '../../persistence/reporting/sprint-report-reader.port.js';

/** Opens the repeatable-read tenant snapshot joined by both directories and history reads. */
export interface SprintReportUnitOfWork {
  // #region Methods
  /** Runs the report and its directory calls on one snapshot. */
  runReadOnly<TResult>(work: (reader: SprintReportReader) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
