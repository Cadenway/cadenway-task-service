import type { GoalsStore } from '../../../../models/goal/goals-store.model.js';

/** Tenant transaction boundary for goals and authorization. */
export interface GoalsUnitOfWork {
  // #region Methods
  /** Runs a write or joins the enclosing tenant transaction. */
  run<T>(work: (store: GoalsStore) => Promise<T>): Promise<T>;

  /** Runs reads in a consistent snapshot, including authorization and linked targets. */
  read<T>(work: (store: GoalsStore) => Promise<T>): Promise<T>;
  // #endregion
}
