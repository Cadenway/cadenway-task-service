import type { SprintLifetimeReader } from '../../persistence/reporting/sprint-lifetime-reader.port.js';

/** Joins the caller's tenant snapshot for visibility and all history pages. */
export interface SprintLifetimesUnitOfWork {
  // #region Methods
  /** Runs all reads in the tenant snapshot. */
  read<TResult>(work: (reader: SprintLifetimeReader) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
