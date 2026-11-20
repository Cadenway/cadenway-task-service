import type { SearchAccessStore } from '../../../../models/search-access/search-access-store.model.js';

/** Runs all membership, placement and grant reads in one read-only tenant snapshot. */
export interface SearchAccessUnitOfWork {
  // #region Methods
  /** Joins all owner reads to the same snapshot. */
  read<T>(work: (store: SearchAccessStore) => Promise<T>): Promise<T>;
  // #endregion
}
