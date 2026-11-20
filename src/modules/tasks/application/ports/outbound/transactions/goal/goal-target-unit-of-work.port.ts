import type { GoalTargetReader } from '../../persistence/goal/goal-target-reader.port.js';

/** Provides target reads in the caller's tenant transaction. */
export interface GoalTargetUnitOfWork {
  // #region Methods
  /** Joins the existing write when locks are required. */
  run<T>(work: (reader: GoalTargetReader) => Promise<T>): Promise<T>;

  /** Reads a consistent snapshot, joining a compatible existing read transaction. */
  read<T>(work: (reader: GoalTargetReader) => Promise<T>): Promise<T>;
  // #endregion
}
