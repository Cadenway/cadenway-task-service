import type { SavedViewsStore } from '../../../../models/view/saved-views-store.model.js';

/** Starts or joins a tenant transaction covering authorization and view side effects. */
export interface SavedViewsUnitOfWork {
  // #region Methods
  /** Runs a write, or joins an enclosing tenant write. */
  run<T>(work: (store: SavedViewsStore) => Promise<T>): Promise<T>;

  /** Runs a standalone read in a consistent snapshot. */
  read<T>(work: (store: SavedViewsStore) => Promise<T>): Promise<T>;
  // #endregion
}
