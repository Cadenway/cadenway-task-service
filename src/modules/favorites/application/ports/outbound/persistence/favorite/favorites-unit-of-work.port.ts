import type { FavoriteRepository } from './favorite-repository.port.js';

/** Runs favorites persistence and target lookups in the same tenant transaction. */
export interface FavoritesUnitOfWork {
  // #region Methods
  /** Writes or joins an active write transaction. */
  write<TResult>(work: (favorites: FavoriteRepository) => Promise<TResult>): Promise<TResult>;

  /** Reads the collection and its targets from the same database snapshot. */
  read<TResult>(work: (favorites: FavoriteRepository) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
