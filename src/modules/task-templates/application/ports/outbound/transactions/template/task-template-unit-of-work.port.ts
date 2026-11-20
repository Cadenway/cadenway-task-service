import type { TaskTemplateStore } from '../../../../models/transactions/task-template-store.model.js';

/** Runs each library operation in the caller's tenant transaction. */
export interface TaskTemplateUnitOfWork {
  // #region Methods
  /** Runs a write inside the tenant transaction. */
  run<TResult>(work: (store: TaskTemplateStore) => Promise<TResult>): Promise<TResult>;

  /** Reads a consistent snapshot of permissions and templates. */
  read<TResult>(work: (store: TaskTemplateStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
