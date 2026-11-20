import type { PriorSprintReader } from '../../persistence/reporting/prior-sprint-reader.port.js';

/** Keeps prior-sprint authorization and selection within the report's tenant snapshot. */
export interface PriorSprintsUnitOfWork {
  // #region Methods
  /** Joins the enclosing repeatable-read transaction, or opens a repeatable-read snapshot. */
  read<TResult>(work: (reader: PriorSprintReader) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
