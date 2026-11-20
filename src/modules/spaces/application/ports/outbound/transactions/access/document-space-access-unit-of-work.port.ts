import type { DocumentSpaceAccessStore } from '../../../../models/access/document-space-access-store.model.js';

/** Keeps membership and space authorization in a single read-only repeatable-read snapshot. */
export interface DocumentSpaceAccessUnitOfWork {
  // #region Methods
  /** Opens or joins the tenant snapshot for the entire proof. */
  read<TResult>(work: (store: DocumentSpaceAccessStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
