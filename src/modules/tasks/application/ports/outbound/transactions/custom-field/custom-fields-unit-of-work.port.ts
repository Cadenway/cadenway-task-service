import type { CustomFieldsStore } from '../../../../models/custom-field/custom-fields-store.model.js';

/** Opens or joins the tenant transaction of a definition operation. */
export interface CustomFieldsUnitOfWork {
  // #region Methods
  /** Runs the requested field operation. */
  run<TResult>(work: (store: CustomFieldsStore) => Promise<TResult>): Promise<TResult>;
  runReadOnly<TResult>(work: (store: CustomFieldsStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
